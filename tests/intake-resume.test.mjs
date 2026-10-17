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
    const otherHistory = await (await request('/api/sessions', other)).json();
    assert.ok(!otherHistory.some(item => item.id === session.id));
    assert.equal((await request(`${path}/undo`, other, 'POST')).status, 404);
    for (const [suffix, method, body] of [['', 'GET'], ['/triage', 'GET'], ['/turn', 'POST', { answer: 'No' }], ['/responses/severity', 'PUT', { answer: '2' }]]) {
      assert.equal((await request(path + suffix, other, method, body)).status, 404);
    }
    await request('/api/auth/logout', patient, 'POST');
    await stop();
    await start();
    patient = await login('ramesh.patel@example.com');
    const history = await (await request(path, patient)).json();
    assert.equal(history.transcript[0].questionText, initial.question.text);
    assert.equal(history.transcript[0].answer, 'I have a fever');
    const restored = await (await request(`${path}/triage`, patient)).json();
    assert.deepEqual(restored.answered, next.answered);
    assert.equal(restored.question.id, next.question.id);
    let progress = restored;
    let reachedHistory = false;
    for (let turnIndex = 0; turnIndex < 40 && !progress.complete && !progress.escalated; turnIndex++) {
      if (progress.step === 3) reachedHistory = true;
      const answer = progress.question.id === 'fv-hydration' ? 'Yes' : progress.question.kind === 'boolean' ? 'No' : progress.question.kind === 'number' ? '3' : 'None';
      const result = await request(`${path}/turn`, patient, 'POST', { questionId: progress.question.id, answer });
      assert.equal(result.status, 200);
      progress = await result.json();
      const reloaded = await (await request(`${path}/triage`, patient)).json();
      assert.equal(reloaded.step, progress.step, 'Refresh must preserve the current step');
    }
    assert.ok(reachedHistory, 'The intake must transition to health history');
    assert.equal(progress.step, 4);
    assert.equal(progress.complete, true);
    const beforeUndo = await (await request(path, patient)).json();
    const undone = await (await request(`${path}/undo`, patient, 'POST')).json();
    assert.equal(undone.complete, false);
    assert.equal(undone.question.id, beforeUndo.transcript.at(-1).questionId);
    assert.equal(undone.removedAnswer, beforeUndo.transcript.at(-1).answer);
    assert.equal(undone.answered.length, beforeUndo.transcript.length - 1);
    const newConversation = await (await request('/api/sessions', patient, 'POST', { locale: 'en-IN', patient: 'Another intake' })).json();
    assert.notEqual(newConversation.id, session.id);
    const historyList = await (await request('/api/sessions', patient)).json();
    assert.ok(historyList.some(item => item.id === session.id));
    assert.ok(historyList.some(item => item.id === newConversation.id));
    assert.equal((await request(path, patient)).status, 200);
    assert.equal((await request(`/api/sessions/${newConversation.id}/undo`, patient, 'POST')).status, 409);
    assert.equal((await request('/api/sessions/missing', patient)).status, 404);
  } finally {
    if (server) await stop();
    assert.ok(resolve(fixture).startsWith(resolve(tmpdir())));
    await rm(fixture, { recursive: true, force: true });
  }
});
