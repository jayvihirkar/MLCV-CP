import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('contextual questions persist through the API and appear in clinician history', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'meditrace-adaptive-'));
  let child;
  t.after(async () => { if (child) { const exited = once(child, 'exit'); child.kill(); await exited; } await rm(fixture, { recursive: true, force: true }); });
  await cp(new URL('../server', import.meta.url), join(fixture, 'server'), { recursive: true });
  for (const name of ['index.mjs', 'attachments.mjs']) {
    const path = join(fixture, 'server', name); let source = await readFile(path, 'utf8');
    for (const dependency of ['express', 'multer']) source = source.replace(`from '${dependency}'`, `from '${import.meta.resolve(dependency)}'`);
    if (name === 'index.mjs') source = source.replace('app.listen(port,', 'const listening = app.listen(port,').replace('http://localhost:${port}', 'http://localhost:${listening.address().port}');
    await writeFile(path, source);
  }
  const bootstrap = join(fixture, 'gemini-fixture.mjs');
  await writeFile(bootstrap, `
    globalThis.fetch = async (url, options) => {
      if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) throw new Error('Unexpected external request');
      const prompt = JSON.parse(options.body).contents[0].parts[0].text;
      const history = JSON.parse(prompt.split('\\n').find(line => line.startsWith('Conversation (')).split(': ').slice(1).join(': '));
      const count = history.length;
      const next = {2:['Does your dry cough get worse at night?', 'Cough pattern', 'concern'],3:['Do you have medical conditions or take any medicines?', 'Medical history and medicines', 'history'],4:['Do you have any medicine allergies?', 'Allergies', 'history'],5:['Is there anything else you want your care team to know?', 'Additional concerns', 'review']}[count] || ['', 'Complete', 'review'];
      const result = {nextQuestionText:next[0],summaryLabel:next[1],section:next[2],answerRelevant:!prompt.includes('weather tomorrow'),complete:count>=6,redFlagIds:[]};
      return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]});
    };
  `);
  child = spawn(process.execPath, ['--import', pathToFileURL(bootstrap).href, join(fixture, 'server/index.mjs')], { env: { ...process.env, PORT: '0', VERCEL: '', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', GEMINI_API_KEY: 'fixture-only', DOCUMENT_PIPELINE_URL: '', DOCUMENT_PIPELINE_TOKEN: '', SEED_DEMO_USERS: 'true', DOCTOR_RECORDS_SINCE: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const [output] = await once(child.stdout, 'data');
  const base = 'http://localhost:' + String(output).match(/:(\d+)/)[1];
  const request = async (path, token, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.ok(response.ok, `${path}: ${response.status}`); return response.json();
  };
  const login = async email => (await request('/api/auth/login', '', 'POST', { email, password: 'meditrace123' })).token;
  const token = await login('ramesh.patel@example.com');
  const session = await request('/api/sessions', token, 'POST', { locale: 'en-IN' });
  const path = '/api/sessions/' + session.id;
  let pending = await request(path + '/triage', token);
  const turn = async answer => { pending = await request(path + '/turn', token, 'POST', { questionId: pending.question.id, answer }); return pending; };
  await turn('Dry cough for 5 days');
  assert.equal(pending.question.id, 'cough-safety');
  await turn('No');
  assert.equal(pending.assistant.mode, 'gemini');
  assert.equal(pending.question.text, 'Does your dry cough get worse at night?');
  assert.equal((await request(path + '/triage', token)).question.text, pending.question.text, 'Reload preserves generated question');
  await turn('What is the weather tomorrow');
  assert.equal(pending.accepted, false);
  assert.equal(pending.answered.length, 2, 'Irrelevant answers are not saved as clinical history');
  for (const answer of ['At night', 'No conditions or regular medicines', 'No known medicine allergies', 'Nothing else']) await turn(answer);
  assert.equal(pending.complete, true);
  const saved = await request(path, token);
  assert.ok(saved.transcript.some(item => item.questionText.includes('Does your dry cough get worse at night?') && item.answer === 'At night'));
  const doctor = await login('doctor@meditrace.health');
  const record = (await request('/api/doctor/patients/INTAKE-' + session.id.slice(0, 8), doctor)).patient;
  assert.ok(record.summary.sections.find(item => item.id === 'medications-allergies').body.includes('No known medicine allergies'));
  const urgent = await request('/api/sessions', token, 'POST', { locale: 'en-IN' });
  await request('/api/sessions/' + urgent.id + '/turn', token, 'POST', { questionId: 'chief-complaint', answer: 'Cough for three days' });
  const escalation = await request('/api/sessions/' + urgent.id + '/turn', token, 'POST', { questionId: 'cough-safety', answer: 'Yes' });
  assert.equal(escalation.escalated, true, 'Safety escalation remains controlled by the rules');
});
