import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('conversation sidebar supports organization and protects deletion behind confirmation', async () => {
  const source = (await readFile(new URL('../src/conversations.js', import.meta.url), 'utf8')).replace("import './conversations.css';", '').replaceAll('export ', '');
  const nodes = new Map();
  function node() { return { listeners: {}, dataset: {}, hidden: false, innerHTML: '', classList: { toggle() {}, contains() { return false; } }, addEventListener(name, handler) { this.listeners[name] = handler; }, querySelectorAll() { return []; }, querySelector() { return { focus() {} }; }, setAttribute(name, value) { this[name] = value; }, showModal() { this.open = true; }, close() { this.open = false; } }; }
  const query = key => { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); };
  const data = { accountId: 'p1', firstChat: false, groups: [{ id: 'g1', name: 'Visits' }], chats: [{ id: 'c1', title: 'Current conversation', status: 'In progress', count: 2, groupId: null }, { id: 'c2', title: 'Older conversation', status: 'Complete', count: 5, groupId: 'g1' }] };
  const calls = [], opened = [], deleted = [], guides = [];
  let created = 0;
  const storage = new Map();
  const context = vm.createContext({
    document: { querySelector: query, addEventListener() {}, body: node() },
    window: { confirm: () => context.confirmDelete === true },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    FormData: class { constructor(form) { this.fields = form.fields; } get(key) { return this.fields[key]; } },
    options: {
      request: async (url, options) => { calls.push([url, options]); return url === '/api/conversations' ? structuredClone(data) : {}; },
      currentSession: () => ({ id: 'c1' }), isBusy: () => false,
      onOpen: async id => { opened.push(id); }, onNew: async () => { created++; }, onDeleted: async id => { deleted.push(id); }, onGuide: value => guides.push(value),
    },
  });
  vm.runInContext(source, context);
  await vm.runInContext('globalThis.sidebar = createConversationSidebar(options); sidebar.refresh()', context);
  assert.equal(query('#chatHistory').hidden, false);
  assert.equal(guides.at(-1), false);
  assert.ok(query('#conversationList').innerHTML.includes('Older conversation'));
  assert.ok(query('#conversationList').innerHTML.includes('data-action="chat-menu"'));
  assert.ok(!query('#conversationList').innerHTML.includes('data-action="reset'));
  const click = async (action, id) => query('#conversationList').listeners.click({ target: { closest: () => ({ dataset: { action, id } }) } });
  await click('open-chat', 'c2');
  assert.deepEqual(opened, ['c2']);
  await click('delete-chat', 'c2');
  assert.equal(deleted.length, 0);
  context.confirmDelete = true;
  await click('delete-chat', 'c2');
  assert.deepEqual(deleted, ['c2']);
  await click('rename-chat', 'c2');
  await query('#chatManagerForm').listeners.submit({ preventDefault() {}, target: { fields: { name: 'Renamed chat' } } });
  assert.ok(calls.some(([url, options]) => url === '/api/conversations/c2' && JSON.parse(options.body).title === 'Renamed chat'));
  await click('move-chat', 'c2');
  await query('#chatManagerForm').listeners.submit({ preventDefault() {}, target: { fields: { groupId: '' } } });
  assert.ok(calls.some(([url, options]) => url === '/api/conversations/c2' && JSON.parse(options.body).groupId === null));
  await query('#newSidebarConversation').listeners.click();
  assert.equal(created, 1);
  data.firstChat = true;
  await vm.runInContext('sidebar.refresh()', context);
  assert.equal(query('#chatHistory').hidden, true);
  assert.equal(guides.at(-1), true);
  const wide = vm.runInContext('chatMenuPosition({left:240,top:780},{right:280},{height:200},{width:1280,height:800})', context);
  assert.ok(wide.left > 280, 'The menu should sit outside the sidebar when there is room');
  assert.ok(wide.top + 200 <= 792, 'The menu should remain above the bottom edge');
  const narrow = vm.runInContext('chatMenuPosition({left:250,top:100},{right:290},{height:200},{width:375,height:600})', context);
  assert.ok(narrow.left >= 8 && narrow.left + narrow.width <= 367, 'The menu should fit a narrow screen');
});
