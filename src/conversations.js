import './conversations.css';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const dots = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
export function chatMenuPosition(anchor, sidebar, menu, viewport) {
  const width = Math.min(196, Math.max(0, viewport.width - 16));
  let left = sidebar.right + 8;
  if (left + width > viewport.width - 8) left = Math.max(8, Math.min(viewport.width - width - 8, anchor.left - width - 8));
  const height = Math.min(menu.height, viewport.height - 16);
  return { left, top: Math.max(8, Math.min(anchor.top, viewport.height - height - 8)), width };
}
export function createConversationSidebar({ request, currentSession, isBusy, onOpen, onNew, onDeleted, onGuide }) {
  const $ = selector => document.querySelector(selector);
  const host = $('#conversationList');
  const dialog = $('#chatManager');
  let data = { groups: [], chats: [] };
  let collapsed = new Set();
  let working = false;
  let managerAction = null;
  let activeMenu = null;
  let menuAnchor = null;
  function status(message) { $('#conversationSidebarStatus').textContent = message; }
  function mobile(open) {
    document.body.classList.toggle('patient-sidebar-open', open);
    $('#openChatSidebar').setAttribute('aria-expanded', String(open));
    $('#chatSidebarBackdrop').hidden = !open;
  }
  function closeMenus(restoreFocus = false) {
    if (activeMenu) {
      if (typeof activeMenu.hidePopover === 'function' && activeMenu.matches(':popover-open')) activeMenu.hidePopover();
      activeMenu.hidden = true;
    }
    host.querySelectorAll('[data-action$="-menu"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    if (restoreFocus) menuAnchor?.focus();
    activeMenu = null;
    menuAnchor = null;
  }
  function openMenu(button, menu) {
    const open = activeMenu !== menu;
    closeMenus();
    if (!open) return;
    activeMenu = menu; menuAnchor = button;
    menu.hidden = false;
    if (typeof menu.showPopover === 'function') menu.showPopover();
    const position = chatMenuPosition(button.getBoundingClientRect(), button.closest('.side-panel').getBoundingClientRect(), menu.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
    menu.style.width = `${position.width}px`; menu.style.left = `${position.left}px`; menu.style.top = `${position.top}px`;
    button.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus();
  }
  const action = (name, label, id) => `<button type="button" data-action="${name}" data-id="${escape(id)}">${label}</button>`;
  function chatRow(chat) {
    const active = chat.id === currentSession()?.id;
    return `<div class="sidebar-chat-row${active ? ' active' : ''}"><button type="button" class="sidebar-chat-open" data-action="open-chat" data-id="${escape(chat.id)}" ${active ? 'aria-current="page"' : ''}><span>${escape(chat.title)}</span><small>${escape(chat.status)} · ${chat.count} answers</small></button><button type="button" class="sidebar-dots" data-action="chat-menu" data-id="${escape(chat.id)}" aria-label="Options for ${escape(chat.title)}" aria-expanded="false">${dots}</button><div class="sidebar-row-menu" data-row-menu popover="manual" hidden>${action('rename-chat', 'Rename', chat.id)}${action('move-chat', 'Move to group', chat.id)}${action('chat-up', 'Move up', chat.id)}${action('chat-down', 'Move down', chat.id)}${action('delete-chat', 'Delete', chat.id)}</div></div>`;
  }
  function draw() {
    closeMenus();
    const group = item => `<section class="sidebar-chat-group"><div class="sidebar-group-heading"><button type="button" data-action="toggle-group" data-id="${escape(item.id)}" aria-expanded="${!collapsed.has(item.id)}"><span aria-hidden="true">${collapsed.has(item.id) ? '▸' : '▾'}</span> ${escape(item.name)} <small>${data.chats.filter(chat => chat.groupId === item.id).length}</small></button><button type="button" class="sidebar-dots" data-action="group-menu" data-id="${escape(item.id)}" aria-label="Options for group ${escape(item.name)}" aria-expanded="false">${dots}</button><div class="sidebar-row-menu" data-row-menu popover="manual" hidden>${action('rename-group', 'Rename group', item.id)}${action('group-up', 'Move group up', item.id)}${action('group-down', 'Move group down', item.id)}${action('delete-group', 'Delete group', item.id)}</div></div><div ${collapsed.has(item.id) ? 'hidden' : ''}>${data.chats.filter(chat => chat.groupId === item.id).map(chatRow).join('') || '<p class="sidebar-empty">No conversations in this group.</p>'}</div></section>`;
    host.innerHTML = data.groups.map(group).join('') + `${data.groups.length ? '<h3 class="sidebar-ungrouped">Ungrouped</h3>' : ''}` + data.chats.filter(chat => !chat.groupId).map(chatRow).join('');
    if (!data.chats.length && !data.groups.length) host.innerHTML = '<p class="sidebar-empty">Your conversations will appear here.</p>';
    $('#chatHistory').hidden = data.firstChat;
    onGuide(data.firstChat);
  }
  async function refresh() {
    try {
      data = await request('/api/conversations');
      try { collapsed = new Set(JSON.parse(localStorage.getItem(`meditrace.chatGroups.${data.accountId}`) || '[]')); } catch { collapsed = new Set(); }
      draw();
      $('#retryConversations').hidden = true;
    } catch (error) { status(error.message); $('#retryConversations').hidden = false; }
  }
  async function perform(work) {
    if (working) return;
    if (isBusy()) { status('Finish your current response before changing conversations.'); return; }
    working = true;
    try { await work(); }
    catch (error) { status(error.message); }
    finally { working = false; }
  }
  function openManager(kind, id) {
    managerAction = { kind, id };
    const chat = data.chats.find(item => item.id === id);
    const group = data.groups.find(item => item.id === id);
    $('#chatManagerTitle').textContent = { 'create-group': 'New group', 'rename-group': 'Rename group', 'rename-chat': 'Rename conversation', 'move-chat': 'Move conversation' }[kind];
    $('#chatManagerFields').innerHTML = kind === 'move-chat' ? `<label>Move to<select name="groupId"><option value="">Ungrouped</option>${data.groups.map(item => `<option value="${escape(item.id)}" ${chat?.groupId === item.id ? 'selected' : ''}>${escape(item.name)}</option>`).join('')}</select></label>` : `<label>${kind === 'rename-chat' ? 'Conversation name' : 'Group name'}<input name="name" required maxlength="${kind === 'rename-chat' ? 150 : 80}" value="${escape(chat?.title || group?.name || '')}" /></label>`;
    $('#chatManagerError').textContent = '';
    dialog.showModal();
    dialog.querySelector('input,select')?.focus();
  }
  host.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const kind = button.dataset.action, id = button.dataset.id;
    if (kind.endsWith('-menu')) {
      const menu = button.parentElement.querySelector('[data-row-menu]');
      openMenu(button, menu);
      return;
    }
    closeMenus();
    if (kind === 'toggle-group') {
      if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
      localStorage.setItem(`meditrace.chatGroups.${data.accountId}`, JSON.stringify([...collapsed])); draw(); return;
    }
    if (kind.startsWith('rename-') || kind === 'move-chat') { if (!working && !isBusy()) openManager(kind, id); return; }
    await perform(async () => {
      if (kind === 'open-chat') { if (id !== currentSession()?.id) { await onOpen(id); mobile(false); } return; }
      if (kind === 'delete-chat') {
        if (!window.confirm('Permanently delete this conversation and its clinician review? Account profile history will remain.')) return;
        await request(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await onDeleted(id); status('Conversation deleted.');
      } else if (kind === 'delete-group') {
        if (!window.confirm('Delete this group? Its conversations will move to Ungrouped.')) return;
        await request(`/api/conversations/groups/${id}`, { method: 'DELETE' }); status('Group deleted. Conversations kept in Ungrouped.');
      } else if (kind.startsWith('chat-') || kind.startsWith('group-')) {
        await request(`/api/conversations/${kind.startsWith('group-') ? 'groups/' : ''}${id}`, { method: 'PUT', body: JSON.stringify({ move: kind.endsWith('-up') ? 'up' : 'down' }) });
      }
      await refresh();
    });
  });
  $('#chatManagerForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (working || isBusy()) return;
    const form = new FormData(event.target), { kind, id } = managerAction;
    working = true;
    $('#saveChatManager').disabled = true;
    try {
      const name = form.get('name')?.trim();
      const path = kind === 'create-group' ? '/api/conversations/groups' : kind === 'rename-group' ? `/api/conversations/groups/${id}` : `/api/conversations/${id}`;
      await request(path, { method: kind === 'create-group' ? 'POST' : 'PUT', body: JSON.stringify(kind === 'move-chat' ? { groupId: form.get('groupId') || null } : kind === 'rename-chat' ? { title: name } : { name }) });
      dialog.close(); await refresh(); status('Conversation organization saved.');
    } catch (error) { $('#chatManagerError').textContent = error.message; }
    finally { working = false; $('#saveChatManager').disabled = false; }
  });
  $('#newSidebarConversation').addEventListener('click', () => perform(async () => { await onNew(); mobile(false); }));
  $('#createChatGroup').addEventListener('click', () => { if (!working && !isBusy()) openManager('create-group'); });
  $('#cancelChatManager').addEventListener('click', () => { if (!working) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (working) event.preventDefault(); });
  $('#retryConversations').addEventListener('click', refresh);
  $('#openChatSidebar').addEventListener('click', () => mobile(!document.body.classList.contains('patient-sidebar-open')));
  $('#closeChatSidebar').addEventListener('click', () => mobile(false));
  $('#chatSidebarBackdrop').addEventListener('click', () => mobile(false));
  document.addEventListener('click', event => { if (!event.target.closest('#conversationList')) closeMenus(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMenus(true); mobile(false); } });
  document.addEventListener('scroll', event => { if (!event.target.closest?.('[data-row-menu]')) closeMenus(); }, true);
  window.addEventListener?.('resize', () => closeMenus());
  return { refresh };
}
