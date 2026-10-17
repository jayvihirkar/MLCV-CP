import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('clarification display preserves the exchange, escapes patient text, and closes reply controls after approval', async () => {
  const source = (await readFile(new URL('../src/clarifications.js', import.meta.url), 'utf8')).replace("import './clarifications.css';", '').replaceAll('export ', '');
  const listeners = {};
  const context = vm.createContext({ document: { addEventListener: (name, handler) => { listeners[name] = handler; } }, thread: {
    id: 'thread-1', status: 'awaiting_patient', target: { label: 'Surgery' },
    messages: [
      { role: 'doctor', kind: 'question', author: 'Doctor', text: 'Which knee?', at: '2026-10-18T00:00:00Z' },
      { role: 'patient', kind: 'answer', author: 'Patient', text: '<img src=x onerror=alert(1)>', at: '2026-10-18T00:01:00Z' },
      { role: 'doctor', kind: 'question', author: 'Doctor', text: 'When was the surgery?', at: '2026-10-18T00:02:00Z' },
    ],
  } });
  vm.runInContext(source, context);
  const patient = vm.runInContext("clarificationHistory(thread, { patient: true, draft: 'March 2020' })", context);
  assert.ok(patient.includes('Which knee?'));
  assert.ok(patient.includes('When was the surgery?'));
  assert.ok(patient.includes('&lt;img'));
  assert.ok(!patient.includes('<img'));
  assert.ok(patient.includes('March 2020'));
  assert.ok(patient.includes('data-clarification-reply="thread-1"'));
  const doctor = vm.runInContext('clarificationHistory(thread)', context);
  assert.ok(!doctor.includes('data-clarification-reply'));
  context.thread.status = 'approved';
  const approved = vm.runInContext('clarificationHistory(thread, { patient: true })', context);
  assert.ok(approved.includes('Approved'));
  assert.ok(!approved.includes('data-clarification-reply'));
  assert.ok(approved.includes('Which knee?'));
  const launcher = vm.runInContext('clarificationLauncher([thread], { patient: true })', context);
  assert.ok(launcher.includes('aria-expanded="false"'));
  assert.ok(launcher.includes('class="clarification-chat-panel" hidden'));
  const panel = { hidden: true };
  const button = { dataset: { toggleClarification: 'timeline-thread-1' }, setAttribute(name, value) { this[name] = value; }, closest: () => ({ querySelector: () => panel }) };
  listeners.click({ target: { closest: () => button } });
  assert.equal(panel.hidden, false);
  assert.equal(button['aria-expanded'], 'true');
  assert.ok(vm.runInContext('clarificationLauncher([thread], { patient: true })', context).includes('aria-expanded="true"'));
});
