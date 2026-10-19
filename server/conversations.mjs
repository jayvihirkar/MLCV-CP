import { readJson, writeJson } from './persistence.mjs';
import { randomUUID } from 'node:crypto';

export function registerConversationRoutes(app, { authenticate, file, readSessions }) {
  async function read() { return readJson(file, {}); }
  let pending = Promise.resolve();
  function update(userId, change) {
    const operation = pending.then(async () => {
      const accounts = await read();
      const settings = accounts[userId] || { groups: [], chats: {}, order: [], returning: false };
      const result = change(settings);
      accounts[userId] = settings;
      await writeJson(file, accounts);
      return result;
    });
    pending = operation.catch(() => {});
    return operation;
  }
  const error = (message, status = 400) => { const result = new Error(message); result.status = status; throw result; };
  const route = handler => async (req, res, next) => {
    try {
      if (req.user.role !== 'Patient') return res.status(403).json({ error: 'Chat organization is available to patient accounts only.' });
      await handler(req, res);
    } catch (failure) { if (failure.status) res.status(failure.status).json({ error: failure.message }); else next(failure); }
  };
  const ownSessions = async userId => (await readSessions()).filter(session => session.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const orderedIds = (sessions, settings) => {
    const known = new Set(sessions.map(session => session.id));
    const saved = settings.order.filter(id => known.has(id));
    return [...sessions.map(session => session.id).filter(id => !saved.includes(id)), ...saved];
  };
  app.get('/api/conversations', authenticate, route(async (req, res) => {
    const sessions = await ownSessions(req.user.userId);
    let settings = (await read())[req.user.userId] || { groups: [], chats: {}, order: [], returning: false };
    if (!settings.returning && (sessions.length > 1 || sessions.some(session => session.triage?.complete || session.triage?.escalated))) settings = await update(req.user.userId, settings => { settings.returning = true; return settings; });
    const byId = new Map(sessions.map(session => [session.id, session]));
    res.json({ accountId: req.user.userId, firstChat: !settings.returning, groups: settings.groups, chats: orderedIds(sessions, settings).map(id => {
      const session = byId.get(id), meta = settings.chats[id] || {};
      return { id, title: meta.title || session.triage?.chiefComplaint || 'New conversation', groupId: meta.groupId || null, createdAt: session.createdAt, updatedAt: session.updatedAt, count: session.triage?.answers?.length || session.responses?.length || 0, status: session.triage?.escalated ? 'Needs attention' : session.triage?.complete ? 'Complete' : 'In progress' };
    }) });
  }));
  app.post('/api/conversations/groups', authenticate, route(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 80) error('Enter a group name of up to 80 characters.');
    const group = await update(req.user.userId, settings => { const group = { id: randomUUID(), name }; settings.groups.push(group); return group; });
    res.status(201).json({ group });
  }));
  app.put('/api/conversations/groups/:id', authenticate, route(async (req, res) => {
    await update(req.user.userId, settings => {
      const index = settings.groups.findIndex(group => group.id === req.params.id);
      if (index < 0) error('Group not found.', 404);
      if ('name' in (req.body || {})) {
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        if (!name || name.length > 80) error('Enter a group name of up to 80 characters.');
        settings.groups[index].name = name;
      }
      if (req.body.move) {
        if (!['up', 'down'].includes(req.body.move)) error('Choose move up or move down.');
        const destination = index + (req.body.move === 'up' ? -1 : 1);
        if (destination >= 0 && destination < settings.groups.length) [settings.groups[index], settings.groups[destination]] = [settings.groups[destination], settings.groups[index]];
      }
    });
    res.json({ ok: true });
  }));
  app.delete('/api/conversations/groups/:id', authenticate, route(async (req, res) => {
    await update(req.user.userId, settings => {
      const index = settings.groups.findIndex(group => group.id === req.params.id);
      if (index < 0) error('Group not found.', 404);
      settings.groups.splice(index, 1);
      for (const meta of Object.values(settings.chats)) if (meta.groupId === req.params.id) meta.groupId = null;
    });
    res.json({ ok: true });
  }));
  app.put('/api/conversations/:id', authenticate, route(async (req, res) => {
    const sessions = await ownSessions(req.user.userId);
    if (!sessions.some(session => session.id === req.params.id)) error('Conversation not found.', 404);
    await update(req.user.userId, settings => {
      const meta = settings.chats[req.params.id] ||= {};
      if ('title' in (req.body || {})) {
        const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
        if (!title || title.length > 150) error('Enter a conversation name of up to 150 characters.');
        meta.title = title;
      }
      if ('groupId' in (req.body || {})) {
        if (req.body.groupId !== null && !settings.groups.some(group => group.id === req.body.groupId)) error('Group not found.', 404);
        meta.groupId = req.body.groupId;
      }
      if (req.body.move) {
        if (!['up', 'down'].includes(req.body.move)) error('Choose move up or move down.');
        const ids = orderedIds(sessions, settings);
        const groupIds = ids.filter(id => (settings.chats[id]?.groupId || null) === (meta.groupId || null));
        const index = groupIds.indexOf(req.params.id), destination = index + (req.body.move === 'up' ? -1 : 1);
        if (destination >= 0 && destination < groupIds.length) [groupIds[index], groupIds[destination]] = [groupIds[destination], groupIds[index]];
        const withinGroup = new Set(groupIds);
        let groupIndex = 0;
        settings.order = ids.map(id => withinGroup.has(id) ? groupIds[groupIndex++] : id);
      }
    });
    res.json({ ok: true });
  }));
  return { forget: (userId, id) => update(userId, settings => { delete settings.chats[id]; settings.order = settings.order.filter(item => item !== id); }) };
}
