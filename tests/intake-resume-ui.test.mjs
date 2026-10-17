import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('patient restores transcript, question and draft, then saves and exits', async () => {
  const nodes = new Map();
  function element() {
    const children = new Map();
    return { value: '', disabled: false, dataset: {}, style: {}, listeners: {}, appended: [],
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; },
      addEventListener(name, handler) { this.listeners[name] = handler; },
      querySelector(selector) { if (!children.has(selector)) children.set(selector, element()); return children.get(selector); },
      append(child) { this.appended.push(child); }, focus() {}, scrollIntoView() {}, click() { this.clicked = true; },
    };
  }
  const query = selector => { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); };
  const saved = new Map([['meditrace.intake.patient-1', JSON.stringify({ id: 'saved-1', draft: 'Two days' })]]);
  const calls = [];
  const steps = Array.from({ length: 4 }, element);
  const context = vm.createContext({
    document: { querySelector: query, querySelectorAll: selector => selector === '.steps .step' ? steps : [], addEventListener() {}, createElement: element },
    localStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
    sessionStorage: { getItem: () => 'token' }, Headers, FormData, console, setTimeout: () => 0,
    window: { lucide: { createIcons() {} }, confirm: () => context.confirmDelete === true, location: { reload() { context.reloaded = true; } } }, lucide: { createIcons() {} },
    fetch: async (path, options) => {
      calls.push([path, options?.method || 'GET', options]);
      const data = path.endsWith('/undo') ? { removedAnswer: 'Correct this answer' } : path === '/api/sessions' && options?.method === 'POST' ? { id: 'new-1', locale: 'en-IN' } : path === '/api/sessions' ? [{ id: 'saved-1', title: 'Fever', count: 1, status: 'In progress', createdAt: '2026-10-18T00:00:00Z' }] : path === '/api/health' ? {} : path === '/api/sessions/saved-1' ? {
        id: 'saved-1', locale: 'en-IN', transcript: [{ questionText: 'What is bothering you today?', label: 'Main concern', answer: 'Fever' }],
      } : path.endsWith('/triage') ? {
        answered: [{ label: 'Main concern', answer: 'Fever' }], remaining: 2,
        question: { id: 'duration', text: 'When did it start?', kind: 'text' },
      } : {};
      return { ok: path !== '/api/narration', status: 503, json: async () => data };
    },
  });
  const source = (await readFile(new URL('../src/main.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '').replace(/export (async )?function /g, '$1function ');
  vm.runInContext(source, context);
  await vm.runInContext("currentUser = { id: 'patient-1', name: 'Test Patient' }; initialise()", context);
  assert.equal(query('#textInput').value, 'Two days');
  assert.equal(query('#micButton').type, 'submit');
  assert.equal(query('#micButton')['aria-label'], 'Send response');
  query('#textInput').value = '   ';
  query('#textInput').listeners.input();
  assert.equal(query('#micButton').type, 'button');
  assert.equal(query('#micButton')['aria-label'], 'Start voice input');
  vm.runInContext('setRecording(true)', context);
  assert.equal(query('#micButton')['aria-label'], 'Stop recording');
  vm.runInContext('setRecording(false)', context);
  query('#textInput').value = 'Two days';
  query('#textInput').listeners.input();
  assert.equal(vm.runInContext('currentQuestion.id', context), 'duration');
  assert.ok(query('#thread').appended.some(node => node.querySelector('p').textContent === 'Fever'));
  const restoredQuestion = query('#thread').appended.find(node => node.querySelector('p').textContent === 'What is bothering you today?');
  assert.ok(restoredQuestion, 'Full question must be restored instead of its summary label');
  assert.equal(restoredQuestion.querySelector('.speak-trigger').dataset.text, 'What is bothering you today?');
  assert.ok(!calls.some(([path, method]) => path === '/api/sessions' && method === 'POST'));
  assert.ok(!calls.some(([path]) => path === '/api/narration'), 'Restoring an intake must stay silent');
  vm.runInContext("addAssistantMessage('A typed follow-up?')", context);
  assert.ok(!calls.some(([path]) => path === '/api/narration'), 'Typed interactions must stay silent before microphone opt-in');
  await vm.runInContext("sttMode = 'browser'; toggleRecording()", context);
  assert.equal(vm.runInContext('voiceEnabled', context), true);
  vm.runInContext("addAssistantMessage('A voice follow-up?')", context);
  assert.ok(calls.some(([path]) => path === '/api/narration'), 'Voice follow-ups speak after microphone opt-in');
  query('#textInput').value = 'Three days';
  assert.equal(await vm.runInContext('saveBeforeSignOut()', context), true);
  assert.equal(JSON.parse(saved.get('meditrace.intake.patient-1')).draft, 'Three days');
  vm.runInContext('submitting = true', context);
  assert.equal(await vm.runInContext('saveBeforeSignOut()', context), false);
  vm.runInContext("renderTriage({ step: 3, answered: [], question: { text: 'Any allergies?', kind: 'text' } })", context);
  assert.equal(steps[1].className, 'step complete');
  assert.equal(steps[2]['aria-current'], 'step');
  vm.runInContext("renderTriage({ step: 4, complete: true, answered: [] })", context);
  assert.equal(steps[2].className, 'step complete');
  assert.equal(steps[3]['aria-current'], 'step');
  assert.equal(query('#intakeReview').hidden, false);
  assert.equal(query('#thread').hidden, true);
  assert.equal(query('#voiceDock').hidden, true);
  query('#viewConversation').listeners.click();
  assert.equal(query('#thread').hidden, false);
  vm.runInContext('submitting = false', context);
  await query('#startNewIntake').listeners.click();
  assert.equal(query('#intakeReview').hidden, true);
  assert.equal(query('#voiceDock').hidden, false);
  assert.equal(vm.runInContext('intakeStep', context), 2);
  assert.equal(JSON.parse(saved.get('meditrace.intake.patient-1')).id, 'new-1');
  assert.equal(vm.runInContext('voiceEnabled', context), false);
  await query('#undoAnswer').listeners.click();
  assert.equal(context.reloaded, true);
  assert.equal(JSON.parse(saved.get('meditrace.intake.patient-1')).draft, 'Correct this answer');
  for (const [path, body] of [
    ['/api/conversations/groups', { name: 'Health records' }],
    ['/api/conversations/groups/group-1', { name: 'Appointments' }],
    ['/api/conversations/saved-1', { groupId: 'group-1' }],
  ]) {
    context.requestPath = path;
    context.requestBody = JSON.stringify(body);
    await vm.runInContext("api(requestPath, { method: 'POST', body: requestBody })", context);
    assert.equal(calls.at(-1)[2].headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(calls.at(-1)[2].body), body);
  }
  await vm.runInContext("api('/api/transcribe', { method: 'POST', body: new FormData() })", context);
  assert.equal(calls.at(-1)[2].headers.has('Content-Type'), false, 'Uploads must let the browser supply the multipart boundary');
});
