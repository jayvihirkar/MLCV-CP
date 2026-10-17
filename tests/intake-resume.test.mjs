import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('saved intake survives login and server restart, and rejects other accounts', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'meditrace-resume-'));
  let server;
  let base;
  async function start() {
    server = spawn(process.execPath, [join(fixture, 'server/index.mjs')], {
      env: { ...process.env, PORT: '0', GEMINI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = await Promise.race([
      once(server.stdout, 'data').then(([chunk]) => String(chunk)),
      once(server, 'exit').then(([code]) => { throw new Error(`Server exited: ${code}`); }),
    ]);
    base = `http://localhost:${output.match(/:(\d+)/)[1]}`;
  }
  async function stop() {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
    server = null;
  }
  async function request(path, token, method = 'GET', body) {
    return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
  }
  async function login(email) {
    const response = await request('/api/auth/login', '', 'POST', { email, password: 'meditrace123' });
    assert.equal(response.status, 200);
    return (await response.json()).token;
  }
  try {
    await cp(new URL('../server', import.meta.url), join(fixture, 'server'), { recursive: true });
    const entry = join(fixture, 'server/index.mjs');
    let source = await readFile(entry, 'utf8');
    for (const dependency of ['express', 'multer']) source = source.replace(`from '${dependency}'`, `from '${import.meta.resolve(dependency)}'`);
    source = source.replace('http://localhost:${port}', 'http://localhost:${appServer.address().port}').replace('app.listen(port,', 'const appServer = app.listen(port,');
    await writeFile(entry, source);
    await start();
    let patient = await login('ramesh.patel@example.com');
    const created = await request('/api/sessions', patient, 'POST', { locale: 'en-IN', patient: 'Resume test' });
    assert.equal(created.status, 201);
    const session = await created.json();
    const path = `/api/sessions/${session.id}`;
    const initial = await (await request(`${path}/triage`, patient)).json();
    const turn = await request(`${path}/turn`, patient, 'POST', { questionId: initial.question.id, answer: 'I have a fever' });
    assert.equal(turn.status, 200);
    const next = await turn.json();
    assert.equal(next.answered[0].answer, 'I have a fever');
    const other = await login('doctor@meditrace.health');
    for (const [suffix, method, body] of [['', 'GET'], ['/triage', 'GET'], ['/turn', 'POST', { answer: 'No' }], ['/responses/severity', 'PUT', { answer: '2' }]]) {
      assert.equal((await request(path + suffix, other, method, body)).status, 404);
    }
    await request('/api/auth/logout', patient, 'POST');
    await stop();
    await start();
    patient = await login('ramesh.patel@example.com');
    const restored = await (await request(`${path}/triage`, patient)).json();
    assert.deepEqual(restored.answered, next.answered);
    assert.equal(restored.question.id, next.question.id);
    assert.equal((await request('/api/sessions/missing', patient)).status, 404);
  } finally {
    if (server) await stop();
    assert.ok(resolve(fixture).startsWith(resolve(tmpdir())));
    await rm(fixture, { recursive: true, force: true });
  }
});
