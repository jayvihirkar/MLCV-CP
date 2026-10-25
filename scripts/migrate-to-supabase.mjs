import '../server/environment.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { persistenceScope, readJson, writeJson } from '../server/persistence.mjs';
import { supabaseConfigured, uploadObject, downloadObject } from '../server/supabase.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function local(name, fallback) {
  try { return JSON.parse(await readFile(join(root, 'data', `${name}.json`), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
if (!supabaseConfigured()) throw new Error('Add Supabase credentials to .env before running this migration.');
await persistenceScope(async () => {
  const localUsers = await local('users', []);
  const cloudUsers = await readJson('users.json', []);
  for (const user of localUsers) {
    if (cloudUsers.some(other => other.email.toLowerCase() === user.email.toLowerCase() && other.id !== user.id)) {
      throw new Error('A cloud account already has a local account email with a different ID. Migrate into an empty project before enabling demo seeding.');
    }
  }
  // Read every local file and attachment first so missing files fail before writes.
  const sources = {};
  for (const name of ['users', 'intakes', 'reviews', 'profiles', 'chat-settings']) sources[name] = await local(name, ['users', 'intakes'].includes(name) ? [] : {});
  const attachments = new Map();
  for (const profile of Object.values(sources.profiles)) for (const event of profile.history || []) for (const item of event.attachments || []) {
    attachments.set(item.id, { item, bytes: await readFile(join(root, 'data', 'attachments', item.id)) });
  }
  for (const [name, source] of Object.entries(sources)) {
    const array = Array.isArray(source);
    const existing = await readJson(`${name}.json`, array ? [] : {});
    const previous = array ? Object.fromEntries(existing.map(item => [item.id, item])) : existing;
    const records = array ? Object.fromEntries(source.map(item => [item.id, item])) : source;
    let imported = 0;
    for (const [key, value] of Object.entries(records)) {
      if (Object.hasOwn(previous, key)) continue;
      if (name === 'profiles') for (const event of value.history || []) for (const attachment of event.attachments || []) {
        const { item, bytes } = attachments.get(attachment.id);
        try { await uploadObject(item.id, bytes, item.mimeType); }
        catch (error) {
          // Allow an interrupted migration to resume without overwriting files.
          if (error.upstreamStatus !== 409 || !(await downloadObject(item.id)).equals(bytes)) throw error;
        }
      }
      previous[key] = value;
      imported++;
    }
    await writeJson(`${name}.json`, array ? Object.values(previous) : previous);
    console.log(`${name}: imported ${imported} records; existing records preserved.`);
  }
});
console.log('Migration complete. Local files were preserved. Existing browser logins must sign in again.');
