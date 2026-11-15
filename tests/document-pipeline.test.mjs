import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateExtraction } from '../server/document-pipeline.mjs';
import vm from 'node:vm';

const text = 'No aspirin allergy. 🧪 Metformin 500 mg twice daily.';
const result = () => ({ pages: [{ number: 1, method: 'trocr', text, entities: [{ text: 'Metformin', start: text.indexOf('Metformin'), end: text.indexOf('Metformin') + 9, score: 0.92, label: 'Medication', category: 'medication' }] }], models: { ocr: 'Medical TrOCR fixture', nlp: 'Medical NER fixture' }, warnings: ['Verify against the original.'] });

test('document results reject invented spans and preserve negation/source context', () => {
  const valid = validateExtraction(result());
  assert.equal(valid.pages[0].text, text);
  assert.equal(valid.pages[0].entities[0].assertion, 'not_assessed');
  const invalid = result(); invalid.pages[0].entities[0].text = 'Invented medicine';
  assert.throws(() => validateExtraction(invalid), error => error.status === 502);
  const oversized = result(); oversized.pages[0].text = 'x'.repeat(30001);
  assert.throws(() => validateExtraction(oversized), error => error.status === 502);
});

test('document findings escape extracted text and expose review only to clinicians', async () => {
  const source = (await readFile(new URL('../src/document-extractions.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '').replace('export function documentExtractionPanel', 'function documentExtractionPanel');
  const context = vm.createContext({ document: { body: {}, querySelectorAll: () => [], addEventListener() {} }, MutationObserver: class { observe() {} }, setInterval() {}, sessionStorage: { getItem() {} }, localStorage: { getItem() {} }, result: result() });
  vm.runInContext(source, context);
  context.result.pages[0].text = '<script>alert(1)</script>';
  const html = vm.runInContext("resultHtml({status:'completed', result, review:null}, 'file-id', true)", context);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('data-review-extraction'));
  assert.ok(!vm.runInContext("resultHtml({status:'completed', result, review:null}, 'file-id', false)", context).includes('data-review-extraction'));
  assert.ok(!vm.runInContext("resultHtml({status:'not_started'}, 'file-id', false)", context).includes('data-process-document'));
  assert.ok(vm.runInContext("resultHtml({status:'failed'}, 'file-id', false)", context).includes('Retry extraction'));
  const progress = vm.runInContext("resultHtml({status:'running', progress:'Reading line 2 of 10 <unsafe>', startedAt:new Date().toISOString()}, 'file-id', false)", context);
  assert.ok(progress.includes('Reading line 2 of 10 &lt;unsafe&gt;'));
  assert.ok(progress.includes('data-check-extraction'));
});

test('uploaded documents queue once, survive restart, enforce ownership, and require doctor review', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'meditrace-documents-'));
  const jobs = new Map(); let submissions = 0, unavailable = false;
  const pdf = Buffer.from('%PDF-1.4\nSynthetic test source\n%%EOF');
  const service = createServer(async (req, res) => {
    const reply = payload => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)); };
    if (req.headers.authorization !== 'Bearer test-worker-token') { res.statusCode = 401; return reply({}); }
    if (req.method === 'POST') {
      if (unavailable) { req.resume(); res.statusCode = 503; return reply({}); }
      assert.ok(Number(req.headers['content-length']) > pdf.length, 'Node sends a bounded multipart Content-Length accepted by the worker');
      const parts = []; for await (const part of req) parts.push(part);
      const form = await new Request('http://fixture/jobs', { method: 'POST', headers: req.headers, body: Buffer.concat(parts) }).formData();
      assert.deepEqual(Buffer.from(await form.get('file').arrayBuffer()), pdf);
      const id = req.headers['idempotency-key']; submissions++;
      if (!jobs.has(id) || jobs.get(id).status === 'failed') jobs.set(id, { id, status: 'queued' });
      return reply(jobs.get(id));
    }
    const id = req.url.split('/').at(-1);
    if (req.method === 'DELETE') { jobs.delete(id); res.statusCode = 204; return res.end(); }
    if (!jobs.has(id)) { res.statusCode = 404; return reply({}); }
    reply(jobs.get(id));
  });
  service.listen(0, '127.0.0.1'); await once(service, 'listening');
  let server, base;
  const request = (path, token, method = 'GET', body) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  async function start(configured = true) {
    server = spawn(process.execPath, [join(fixture, 'server/index.mjs')], { env: { ...process.env, PORT: '0', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', VERCEL: '', SEED_DEMO_USERS: 'true', GEMINI_API_KEY: '', DOCUMENT_PIPELINE_URL: configured ? `http://127.0.0.1:${service.address().port}` : '', DOCUMENT_PIPELINE_TOKEN: configured ? 'test-worker-token' : '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunk = await Promise.race([once(server.stdout, 'data').then(([data]) => String(data)), once(server, 'exit').then(() => { throw new Error('Fixture server exited.'); })]);
    base = `http://localhost:${chunk.match(/:(\d+)/)[1]}`;
  }
  async function stop() { if (server) { const done = once(server, 'exit'); server.kill(); await done; server = null; } }
  const login = async email => { const response = await request('/api/auth/login', '', 'POST', { email, password: 'meditrace123' }); assert.equal(response.status, 200); return (await response.json()).token; };
  t.after(async () => { await stop(); await new Promise(resolve => { service.close(resolve); service.closeAllConnections(); }); await rm(fixture, { recursive: true, force: true }); });
  await cp(new URL('../server', import.meta.url), join(fixture, 'server'), { recursive: true });
  for (const name of ['index.mjs', 'attachments.mjs']) {
    const path = join(fixture, 'server', name); let source = await readFile(path, 'utf8');
    for (const dependency of ['express', 'multer']) source = source.replace(`from '${dependency}'`, `from '${import.meta.resolve(dependency)}'`);
    if (name === 'index.mjs') source = source.replace('http://localhost:${port}', 'http://localhost:${appServer.address().port}').replace('app.listen(port,', 'const appServer = app.listen(port,');
    await writeFile(path, source);
  }
  await start();
  let patient = await login('ramesh.patel@example.com');
  const form = new FormData(); form.set('title', 'Old prescription'); form.set('kind', 'medication'); form.append('attachments', new Blob([pdf], { type: 'application/pdf' }), 'source.pdf');
  assert.equal((await fetch(base + '/api/profile/history', { method: 'POST', headers: { Authorization: `Bearer ${patient}` }, body: form })).status, 201);
  assert.equal(submissions, 1, 'Upload queues extraction before any extraction panel or endpoint is opened');
  const profile = await (await request('/api/profile', patient)).json();
  const item = profile.history[0].attachments[0];
  const endpoint = `/api/profile/attachments/${item.id}/extraction`;
  const usersPath = join(fixture, 'data/users.json');
  const users = JSON.parse(await readFile(usersPath)); users.push({ ...users.find(user => user.role === 'Patient'), id: 'other', email: 'other@example.com' }); await writeFile(usersPath, JSON.stringify(users));
  const other = await login('other@example.com');
  assert.equal((await request(endpoint, other)).status, 404);
  assert.equal((await request(endpoint, other, 'POST')).status, 404);
  assert.equal((await request(endpoint, '')).status, 401);
  assert.equal((await (await request(endpoint, patient)).json()).status, 'queued');
  assert.equal((await (await request(endpoint, patient, 'POST')).json()).status, 'queued');
  await request(endpoint, patient, 'POST');
  assert.equal(submissions, 1, 'Repeated start does not submit another job');
  const job = [...jobs.values()][0]; job.status = 'running';
  job.progress = 'Reading text line 2 of 10';
  assert.equal((await (await request(endpoint, patient)).json()).status, 'running');
  assert.equal((await (await request(endpoint, patient)).json()).progress, job.progress);
  await stop(); await start(); patient = await login('ramesh.patel@example.com');
  job.status = 'completed'; job.result = result();
  const complete = await (await request(endpoint, patient)).json();
  assert.equal(complete.status, 'completed');
  assert.equal(complete.result.pages[0].entities[0].text, 'Metformin');
  assert.equal((await request(endpoint + '/review', patient, 'POST')).status, 403);
  const doctor = await login('doctor@meditrace.health');
  assert.equal((await request(endpoint + '/review', doctor, 'POST')).status, 200);
  assert.ok((await (await request(endpoint, patient)).json()).review.doctorName);
  // A second upload exercises recoverable failure, expired jobs and bad provider spans.
  const retryForm = new FormData(); retryForm.set('title', 'Retry source'); retryForm.set('kind', 'test'); retryForm.append('attachments', new Blob([pdf], { type: 'application/pdf' }), 'retry.pdf');
  await fetch(base + '/api/profile/history', { method: 'POST', headers: { Authorization: `Bearer ${patient}` }, body: retryForm });
  const retryProfile = await (await request('/api/profile', patient)).json();
  const retryItem = retryProfile.history.find(event => event.title === 'Retry source').attachments[0];
  const retryEndpoint = `/api/profile/attachments/${retryItem.id}/extraction`;
  await request(retryEndpoint, patient, 'POST');
  const retryId = [...jobs.keys()].find(key => key !== job.id);
  jobs.get(retryId).status = 'failed';
  assert.equal((await (await request(retryEndpoint, patient)).json()).status, 'failed');
  assert.equal((await (await request(retryEndpoint, patient, 'POST')).json()).status, 'queued');
  jobs.delete(retryId);
  assert.equal((await (await request(retryEndpoint, patient)).json()).status, 'failed', 'Expired jobs can be retried');
  await request(retryEndpoint, patient, 'POST');
  jobs.get(retryId).status = 'completed'; jobs.get(retryId).result = result(); jobs.get(retryId).result.pages[0].entities[0].text = 'invented';
  assert.equal((await (await request(retryEndpoint, patient)).json()).status, 'failed', 'Ungrounded provider output becomes a recoverable failure');
  const session = await (await request('/api/sessions', patient, 'POST', { locale: 'hi-IN' })).json();
  const sessionPath = `/api/sessions/${session.id}`;
  const sessionForm = new FormData(); sessionForm.append('attachments', new Blob([pdf], { type: 'application/pdf' }), 'easy-upload.pdf');
  unavailable = true;
  const uploaded = await fetch(base + sessionPath + '/documents', { method: 'POST', headers: { Authorization: `Bearer ${patient}` }, body: sessionForm });
  assert.equal(uploaded.status, 201, 'Intake uploads need no medical-history form');
  const intakeFile = (await uploaded.json()).documents[0];
  assert.equal(intakeFile.extraction.status, 'failed', 'Worker downtime does not discard a successful upload');
  unavailable = false;
  assert.equal((await (await request(`/api/profile/attachments/${intakeFile.id}/extraction`, patient, 'POST')).json()).status, 'queued', 'A saved upload can be retried without re-uploading');
  const otherAfterRestart = await login('other@example.com');
  assert.equal((await request(sessionPath + '/documents', otherAfterRestart)).status, 404);
  assert.equal((await request(`/api/profile/attachments/${intakeFile.id}`, otherAfterRestart)).status, 404);
  assert.equal((await request(`/api/profile/attachments/${intakeFile.id}`, patient)).status, 200);
  assert.equal((await (await request(sessionPath + '?onlyIfEmpty=1', patient, 'DELETE')).json()).deleted, false, 'A document-only intake is retained');
  assert.equal((await request(sessionPath + '/submit', patient, 'POST')).status, 409);
  assert.equal((await request(`/api/profile/attachments/${intakeFile.id}/extraction`, patient)).status, 200, 'Extraction supports intake attachments too');
  for (const answer of ['Knee pain', 'Two months', '7', 'No']) {
    const pending = await (await request(sessionPath + '/triage', patient)).json();
    assert.equal((await request(sessionPath + '/turn', patient, 'POST', { questionId: pending.question.id, answer })).status, 200);
  }
  assert.equal((await (await request(sessionPath + '/triage', patient)).json()).complete, true);
  const sent = await (await request(sessionPath + '/submit', patient, 'POST')).json();
  assert.ok(sent.submittedAt);
  assert.equal((await (await request(sessionPath + '/submit', patient, 'POST')).json()).submittedAt, sent.submittedAt, 'Submission is idempotent');
  assert.equal((await (await request(sessionPath, patient)).json()).submittedAt, sent.submittedAt);
  const record = (await (await request(`/api/doctor/patients/INTAKE-${session.id.slice(0, 8)}`, doctor)).json()).patient;
  assert.equal(record.documents.find(doc => doc.id === item.id).extraction.entityCount, 1);
  assert.ok(record.documents.some(doc => doc.id === intakeFile.id && doc.source === 'Uploaded for this intake'));
  assert.equal(record.submittedAt, sent.submittedAt);
  assert.ok(!record.overview.medications.some(medication => medication.name.includes('Metformin')), 'Document mentions do not become active medication facts');
  await request(sessionPath + '/undo', patient, 'POST');
  assert.equal((await (await request(sessionPath, patient)).json()).submittedAt, null, 'Editing an answer reopens submission');
  await request(sessionPath, patient, 'DELETE');
  assert.equal((await request(`/api/profile/attachments/${intakeFile.id}`, patient)).status, 404);
  await assert.rejects(readFile(join(fixture, 'data/attachments', intakeFile.id)), { code: 'ENOENT' });
  await stop(); await start(false); patient = await login('ramesh.patel@example.com');
  assert.equal((await (await request(endpoint, patient)).json()).status, 'completed', 'Cached results remain available without worker configuration');
  assert.equal((await request(`/api/profile/history/${profile.history[0].id}/attachments/${item.id}`, patient, 'DELETE')).status, 200);
  assert.equal((await request(endpoint, patient)).status, 404);
  assert.equal(JSON.parse(await readFile(join(fixture, 'data/document-extractions.json')))[item.id], undefined);
});
