import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('doctor sections start collapsed appropriately and reviewing saves only the selected section', async () => {
  const source = (await readFile(new URL('../src/doctor.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '').replace('export function startDoctorApp', 'function startDoctorApp');
  const nodes = new Map();
  const node = () => ({ dataset: {}, classList: { add() {}, remove() {} }, value: '' });
  const query = key => { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); };
  const field = { value: 'Updated section text' };
  const otherField = { value: 'Unfinished edit in another section' };
  const block = { dataset: { secBlock: 'a', reviewed: 'false' }, querySelector: () => field };
  const otherBlock = { dataset: { secBlock: 'b', reviewed: 'false' }, querySelector: () => otherField };
  const root = { querySelector: query, querySelectorAll: selector => selector === '[data-sec-block]' ? [block, otherBlock] : [] };
  const button = { dataset: { sec: 'a' }, innerHTML: 'Mark reviewed', closest: () => block, setAttribute(name, value) { this[name] = value; } };
  const calls = [];
  const context = vm.createContext({ root, button, document: { hidden: false }, window: {}, setInterval() {}, setTimeout() {}, clearTimeout() {}, requestAnimationFrame: callback => callback(),
    fetch: async (url, options) => {
      if (context.failSave) return { ok: false, status: 500, json: async () => ({ error: 'Save failed' }) };
      const body = JSON.parse(options.body);
      calls.push({ url, body });
      return { ok: true, status: 200, json: async () => ({ review: { sections: { a: { ...body.sections[0] } } } }) };
    },
  });
  vm.runInContext(source, context);
  vm.runInContext("appRoot = root; state.selected = { id: 'patient-1', overview: {}, timeline: [], summary: { sections: [{id:'a', title:'Concern', body:'Original'}, {id:'b', title:'History', body:'Original B'}] } }; bodies.a = 'Original'; bodies.b = 'Original B';", context);
  assert.match(vm.runInContext('overviewCard(state.selected)', context), /^\s*<details[^>]*\bopen\b/);
  assert.doesNotMatch(vm.runInContext('summaryCard(state.selected)', context), /<details[^>]*\bopen\b/);
  assert.doesNotMatch(vm.runInContext('timelineCard(state.selected)', context), /<details[^>]*\bopen\b/);
  await vm.runInContext('saveReviewedSection(button)', context);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.sections, [{ id: 'a', doctorText: 'Updated section text', status: 'reviewed' }]);
  assert.equal(block.dataset.reviewed, 'true');
  assert.equal(button['aria-pressed'], 'true');
  assert.equal(otherField.value, 'Unfinished edit in another section');
  assert.ok(button.innerHTML.includes('Reviewed'));
  assert.ok(vm.runInContext('summaryCard(state.selected)', context).includes('data-reviewed="true"'));
  await vm.runInContext('saveReviewedSection(button)', context);
  assert.equal(calls[1].body.sections[0].status, 'pending');
  assert.equal(button['aria-pressed'], 'false');
  context.failSave = true;
  await vm.runInContext('saveReviewedSection(button)', context);
  assert.equal(block.dataset.reviewed, 'false', 'A failed save must not look reviewed');
  assert.equal(button.disabled, false);
  assert.ok(button.innerHTML.includes('Mark reviewed'));
});
