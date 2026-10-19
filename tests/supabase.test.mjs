import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

// Exercise the real Express/persistence/storage code through HTTP, without keys
// or writes to the developer's data. This fixture implements the REST contract.
test('cloud records, auth and private uploads work across server instances', async t => {
  const records = new Map(), objects = new Map();
  const fixture = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const json = buffer.length && req.headers['content-type']?.includes('application/json') ? JSON.parse(buffer) : null;
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    const signed = url.searchParams.get('token') === 'test-signed-token';
    if (!signed && req.headers.apikey !== 'test-service-role') return reply(403, { error: 'Missing server key' });
    if (url.pathname === '/rest/v1/app_records') {
      if (req.method === 'POST') {
        const id = `${json.namespace}:${json.key}`;
        if (records.has(id)) return reply(409, { code: '23505' });
        records.set(id, json.value); return reply(201, null);
      }
      const name = url.searchParams.get('namespace').slice(3);
      const key = url.searchParams.get('key')?.slice(3);
      const rows = [...records].filter(([id]) => id.startsWith(`${name}:`) && (!key || id === `${name}:${key}`))
        .map(([id, value]) => ({ key: id.slice(name.length + 1), value })).sort((a,b) => a.key.localeCompare(b.key));
      const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 1000);
      return reply(200, rows.slice(offset, offset + limit));
    }
    if (url.pathname === '/rest/v1/rpc/app_apply_changes') {
      for (const change of json.p_changes) {
        if (!isEqual(records.get(`${json.p_namespace}:${change.key}`) ?? null, change.expected)) return reply(409, { code: '40001' });
      }
      for (const change of json.p_changes) {
        const id = `${json.p_namespace}:${change.key}`;
        if (change.value === null) records.delete(id); else records.set(id, change.value);
      }
      return reply(204, null);
    }
    if (url.pathname === '/rest/v1/rpc/app_take_record') {
      const id = `${json.p_namespace}:${json.p_key}`, value = records.get(id);
      if (!value || (json.p_owner && value.userId !== json.p_owner)) return reply(200, null);
      records.delete(id); return reply(200, value);
    }
    const prefix = '/storage/v1/object/';
    if (url.pathname.startsWith(prefix)) {
      let path = url.pathname.slice(prefix.length);
      if (path.startsWith('upload/sign/') && req.method === 'POST') return reply(200, { url: `/object/upload/sign/${path.slice(12)}?token=test-signed-token` });
      if (path.startsWith('sign/') && req.method === 'POST') return reply(200, { signedURL: `/object/sign/${path.slice(5)}?token=test-signed-token` });
      path = path.replace(/^(upload\/sign\/|authenticated\/|sign\/)/, '');
      if (req.method === 'PUT' || req.method === 'POST') {
        if (objects.has(path)) return reply(409, { statusCode: '409' });
        objects.set(path, buffer); return reply(200, { Key: path });
      }
      if (req.method === 'DELETE') { for (const key of json.prefixes) objects.delete(`${path}/${key}`); return reply(200, []); }
      const bytes = objects.get(path);
      if (!bytes) return reply(404, { statusCode: '404' });
      res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(bytes); return;
    }
    reply(404, {});
  });
  fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
  const storageUrl = `http://127.0.0.1:${fixture.address().port}`;
  const previousEnv = { ...process.env };
  Object.assign(process.env, { VERCEL: '1', SUPABASE_URL: storageUrl, SUPABASE_SERVICE_ROLE_KEY: 'test-service-role', SUPABASE_STORAGE_BUCKET: 'meditrace-attachments', SEED_DEMO_USERS: 'true', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret' });
  const servers = [];
  t.after(async () => {
    await Promise.all([...servers, fixture].map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); })));
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  });
  async function instance(id) {
    const { default: app } = await import(`../server/index.mjs?cloud-test=${id}`);
    const server = app.listen(0, '127.0.0.1'); servers.push(server); await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
  }
  const first = await instance('first'), second = await instance('second');
  const request = (origin, path, token = '', method = 'GET', body) => fetch(origin + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const health = await (await request(first, '/api/health')).json();
  assert.equal(health.persistence, 'supabase');
  const login = await request(first, '/api/auth/login', '', 'POST', { email: 'ramesh.patel@example.com', password: 'meditrace123' });
  assert.equal(login.status, 200);
  const { token, user } = await login.json();
  assert.equal((await request(second, '/api/auth/session', token)).status, 200, 'Login survives a different server instance');
  assert.equal((await request(second, '/api/doctor/overview', token)).status, 403);
  assert.equal((await request(second, '/api/profile')).status, 401);
  const created = await request(first, '/api/sessions', token, 'POST', { locale: 'en-IN' });
  assert.equal(created.status, 201);
  const session = await created.json();
  assert.equal((await request(second, `/api/sessions/${session.id}`, token)).status, 200);

  const { persistenceScope, readJson, writeJson } = await import('../server/persistence.mjs');
  const otherId = 'other-patient';
  await persistenceScope(async () => {
    const users = await readJson('users.json', []);
    users.push({ ...users.find(item => item.id === user.id), id: otherId, email: 'other@example.com' });
    await writeJson('users.json', users);
  });
  const other = await (await request(first, '/api/auth/login', '', 'POST', { email: 'other@example.com', password: 'meditrace123' })).json();
  const pdf = Buffer.from('%PDF-1.4\n%%EOF');
  const planResponse = await request(first, '/api/profile/attachment-uploads', token, 'POST', { files: [{ name: 'report.pdf', size: pdf.length }] });
  assert.equal(planResponse.status, 200);
  const plan = await planResponse.json(), upload = plan.uploads[0];
  assert.equal((await fetch(upload.url, { method: 'PUT', headers: { 'Content-Type': upload.mimeType }, body: pdf })).status, 200);
  const history = { title: 'Past report', kind: 'test', date: '2020', attachmentIds: [upload.id] };
  assert.equal((await request(second, '/api/profile/history', other.token, 'POST', history)).status, 400, 'Another account cannot consume the upload ticket');
  assert.equal((await request(second, '/api/profile/history', token, 'POST', history)).status, 201);
  const profile = await (await request(first, '/api/profile', token)).json();
  const attachment = profile.history[0].attachments[0];
  assert.equal(objects.has(`meditrace-attachments/staging/${upload.id}`), false);
  assert.equal((await request(first, `/api/profile/attachments/${attachment.id}`, other.token)).status, 404);
  const download = await request(second, `/api/profile/attachments/${attachment.id}`, token);
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
  assert.equal((await request(first, '/api/profile/history', token, 'POST', history)).status, 400, 'Upload tickets are single-use');
  const badPlan = await (await request(first, '/api/profile/attachment-uploads', token, 'POST', { files: [{ name: 'fake.png', size: pdf.length }] })).json();
  await fetch(badPlan.uploads[0].url, { method: 'PUT', body: pdf });
  assert.equal((await request(first, '/api/profile/history', token, 'POST', { ...history, attachmentIds: [badPlan.uploads[0].id] })).status, 400, 'Uploaded bytes are validated');

  // Distinct records merge; two stale writes to the same record cannot overwrite.
  let release;
  let readFinished;
  const hasRead = new Promise(resolve => { readFinished = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const stale = persistenceScope(async () => {
    const value = await readJson('reviews.json');
    readFinished();
    await barrier;
    value.example = { note: 'stale' };
    await assert.rejects(writeJson('reviews.json', value), error => error.status === 409);
  });
  await hasRead;
  await persistenceScope(async () => { const value = await readJson('reviews.json'); value.example = { note: 'new' }; await writeJson('reviews.json', value); });
  release(); await stale;
  const unchanged = await persistenceScope(() => readJson('reviews.json'));
  assert.equal(unchanged.example.note, 'new');
  let allowMerge, mergeRead;
  const mergeBarrier = new Promise(resolve => { allowMerge = resolve; });
  const mergeHasRead = new Promise(resolve => { mergeRead = resolve; });
  const separate = persistenceScope(async () => {
    const value = await readJson('reviews.json'); mergeRead(); await mergeBarrier;
    value.first = { note: 'first patient' }; await writeJson('reviews.json', value);
  });
  await mergeHasRead;
  await persistenceScope(async () => { const value = await readJson('reviews.json'); value.second = { note: 'second patient' }; await writeJson('reviews.json', value); });
  allowMerge(); await separate;
  assert.deepEqual(Object.keys(await persistenceScope(() => readJson('reviews.json'))).sort(), ['example', 'first', 'second']);
  for (let index = 0; index < 501; index++) records.set(`pagination:${String(index).padStart(4, '0')}`, { id: index });
  assert.equal(Object.keys(await persistenceScope(() => readJson('pagination.json'))).length, 501);

  const oauth = await fetch(first + '/api/auth/google', { redirect: 'manual' });
  const state = new URL(oauth.headers.get('location')).searchParams.get('state');
  const callback = await fetch(`${second}/api/auth/google/callback?state=${state}`, { redirect: 'manual', headers: { cookie: oauth.headers.get('set-cookie').split(';')[0] } });
  assert.equal(callback.status, 302);
  assert.equal(records.has(`oauth-states:${state}`), false, 'OAuth state is consumed across instances');
  await request(second, '/api/auth/logout', token, 'POST');
  assert.equal((await request(first, '/api/auth/session', token)).status, 401, 'Logout revokes the shared login session');
  assert.equal((await request(first, '/api/does-not-exist')).status, 404);
  const { supabaseConfigured } = await import('../server/supabase.mjs');
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  assert.throws(supabaseConfigured, /Set both/);
  process.env.SUPABASE_URL = '';
  assert.throws(supabaseConfigured, /required on Vercel/);
});

function isEqual(a, b) {
  try { assert.deepEqual(a, b); return true; } catch { return false; }
}
