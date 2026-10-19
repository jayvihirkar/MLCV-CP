import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { supabaseConfigured, supabaseRequest } from './supabase.mjs';

const snapshots = new AsyncLocalStorage();
export const persistenceScope = callback => snapshots.run(new Map(), callback);
export const persistenceMiddleware = (_req, _res, next) => persistenceScope(next);
const namespace = file => basename(file, '.json');
const entries = value => Array.isArray(value) ? Object.fromEntries(value.map(item => [item.id, item])) : value;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function readJson(file, fallback = {}) {
  if (!supabaseConfigured()) {
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return structuredClone(fallback); throw error; }
  }
  const name = namespace(file);
  const records = {};
  // PostgREST caps page size; don't silently omit records beyond the first page.
  for (let offset = 0; ; offset += 500) {
    const page = await supabaseRequest(`/rest/v1/app_records?namespace=eq.${encodeURIComponent(name)}&select=key,value&order=key&offset=${offset}&limit=500`);
    for (const row of page) records[row.key] = row.value;
    if (page.length < 500) break;
  }
  snapshots.getStore()?.set(name, structuredClone(records));
  return Array.isArray(fallback) ? Object.values(records) : records;
}

export async function writeJson(file, value) {
  if (!supabaseConfigured()) {
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, file);
    return;
  }
  const name = namespace(file);
  const previous = snapshots.getStore()?.get(name);
  if (!previous) throw new Error(`Read ${name} in a persistence scope before writing it.`);
  const current = entries(value);
  const changes = [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .filter(key => !same(previous[key], current[key]))
    .map(key => ({ key, expected: previous[key] ?? null, value: current[key] ?? null }));
  if (changes.length) await supabaseRequest('/rest/v1/rpc/app_apply_changes', { method: 'POST', body: { p_namespace: name, p_changes: changes } });
  snapshots.getStore().set(name, structuredClone(current));
}

// Short-lived server sessions and OAuth/upload tickets use individual records.
const transient = new Map();
export async function putRecord(name, key, value) {
  if (!supabaseConfigured()) { transient.set(`${name}:${key}`, structuredClone(value)); return; }
  await supabaseRequest('/rest/v1/app_records', { method: 'POST', body: { namespace: name, key, value } });
}
export async function getRecord(name, key) {
  if (!supabaseConfigured()) return transient.get(`${name}:${key}`) || null;
  const rows = await supabaseRequest(`/rest/v1/app_records?namespace=eq.${encodeURIComponent(name)}&key=eq.${encodeURIComponent(key)}&select=value`);
  return rows[0]?.value || null;
}
export async function takeRecord(name, key, owner = null) {
  if (!supabaseConfigured()) {
    const value = transient.get(`${name}:${key}`);
    if (!value || (owner && value.userId !== owner)) return null;
    transient.delete(`${name}:${key}`);
    return value;
  }
  return supabaseRequest('/rest/v1/rpc/app_take_record', { method: 'POST', body: { p_namespace: name, p_key: key, p_owner: owner } });
}
export async function deleteRecord(name, key) { await takeRecord(name, key); }
