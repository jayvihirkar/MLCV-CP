import { readJson, writeJson } from './persistence.mjs';
import { supabaseConfigured, signedDownload } from './supabase.mjs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { receiveAttachments, storeAttachments, removeAttachments, registerAttachmentUploads, resolveUploadedAttachments } from './attachments.mjs';

const kinds = ['condition', 'surgery', 'hospitalization', 'medication', 'allergy', 'vaccination', 'test', 'visit', 'other'];
const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
export async function readPatientProfiles(file) { return readJson(file, {}); }
export function accountTimeline(profile, sessions, userId) {
  const intakes = sessions.filter(session => session.userId === userId && (session.triage?.answers?.length || session.responses?.length));
  const timeline = [
    ...(profile.history || []).map(item => ({ ...item, source: 'patient' })),
    ...intakes.map(session => ({ id: session.id, source: 'intake', kind: 'intake', title: session.triage?.chiefComplaint || 'Intake conversation', date: session.createdAt.slice(0, 10), notes: `${session.triage?.escalated ? 'Needs attention' : session.triage?.complete ? 'Complete' : 'In progress'} · ${session.triage?.answers?.length || session.responses?.length || 0} answers` })),
  ];
  for (const thread of profile.clarifications || []) {
    const item = timeline.find(item => item.id === thread.target.id && (thread.target.type === 'history' ? item.source === 'patient' : item.source === 'intake'));
    if (item) (item.clarifications ||= []).push(thread);
    else timeline.push({ id: `clarification-${thread.id}`, source: 'clarification', kind: 'clarification', title: thread.target.label, date: thread.createdAt.slice(0, 10), notes: 'Doctor clarification history', clarifications: [thread] });
  }
  return timeline.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
}
export function validHistoryDate(value) {
  if (!value) return true;
  if (!/^\d{4}(-\d{2})?(-\d{2})?$/.test(value)) return false;
  const [year, month = 1, day = 1] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function registerProfileRoutes(app, { authenticate, file, readSessions, readReviews, writeReviews }) {
  registerAttachmentUploads(app, authenticate);
  const attachmentDirectory = join(dirname(file), 'attachments');
  const readProfiles = () => readPatientProfiles(file);
  // Serialize updates so saves from different tabs/accounts cannot overwrite one another.
  let pending = Promise.resolve();
  function update(userId, change) {
    const operation = pending.then(async () => {
      const profiles = await readProfiles();
      const profile = profiles[userId] || { details: {}, history: [] };
      const result = change(profile);
      profile.updatedAt = new Date().toISOString();
      profiles[userId] = profile;
      await writeJson(file, profiles);
      return result;
    });
    pending = operation.catch(() => {});
    return operation;
  }
  function patientOnly(req, res, next) {
    if (req.user.role !== 'Patient') return res.status(403).json({ error: 'Patient profile is available to patient accounts only.' });
    next();
  }
  const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
  const message = (role, author, content, kind = role === 'patient' ? 'answer' : 'question') => ({ id: randomUUID(), role, kind, author: author.name, authorId: author.userId, text: content, at: new Date().toISOString() });
  async function ask({ userId, recordId, target, threadId, question, doctor }) {
    question = text(question, 2000);
    if (!question) fail('Enter the question you want the patient to clarify.');
    const sessions = await readSessions();
    return update(userId, profile => {
      profile.clarifications ||= [];
      let thread;
      if (threadId) {
        thread = profile.clarifications.find(item => item.id === threadId);
        if (!thread) fail('Clarification thread not found.', 404);
        if (thread.status === 'awaiting_patient') fail('Wait for the patient to answer the current question before asking a follow-up.', 409);
      } else {
        let label;
        if (target?.type === 'history') label = profile.history.find(item => item.id === target.id)?.title;
        else if (target?.type === 'intake') label = sessions.find(item => item.id === target.id && item.userId === userId)?.triage?.chiefComplaint || (sessions.some(item => item.id === target?.id && item.userId === userId) ? 'Intake conversation' : null);
        else if (target?.type === 'profile') label = 'Patient profile';
        if (!label) fail('Choose a timeline item belonging to this patient.');
        thread = { id: randomUUID(), recordId, recordIds: [recordId], target: { type: target.type, id: target.id || 'profile', label }, createdAt: new Date().toISOString(), messages: [] };
        profile.clarifications.push(thread);
      }
      thread.recordIds = [...new Set([...(thread.recordIds || [thread.recordId]), recordId])];
      thread.messages.push(message('doctor', doctor, question));
      thread.status = 'awaiting_patient';
      thread.updatedAt = new Date().toISOString();
      thread.approvedAt = null;
      return thread;
    });
  }
  async function approve({ userId, recordId, threadId, doctor, note = '' }) {
    return update(userId, profile => {
      const threads = (profile.clarifications || []).filter(item => threadId ? item.id === threadId : (item.recordIds || [item.recordId]).includes(recordId) && item.status !== 'approved');
      if (threadId && !threads.length) fail('Clarification thread not found.', 404);
      if (threads.some(item => item.status === 'awaiting_patient')) fail('The patient has not answered all clarification questions yet.', 409);
      for (const thread of threads) {
        if (thread.status === 'approved') continue;
        thread.messages.push(message('doctor', doctor, text(note, 2000) || 'Clarification approved.', 'approval'));
        thread.status = 'approved'; thread.approvedAt = thread.updatedAt = new Date().toISOString();
      }
      return threads;
    });
  }
  app.get('/api/profile/notifications', authenticate, patientOnly, async (req, res, next) => {
    try {
      const profile = (await readProfiles())[req.user.userId];
      const threads = profile?.clarifications || [];
      res.json({ accountId: req.user.userId, pending: threads.filter(item => item.status === 'awaiting_patient').length, revision: threads.map(item => `${item.id}:${item.updatedAt}`).join('|') });
    } catch (error) { next(error); }
  });
  app.post('/api/profile/clarifications/:id/reply', authenticate, patientOnly, async (req, res, next) => {
    try {
      const answer = text(req.body?.answer, 2000);
      if (!answer) return res.status(400).json({ error: 'Enter your answer before sending.' });
      const thread = await update(req.user.userId, profile => {
        const thread = (profile.clarifications || []).find(item => item.id === req.params.id);
        if (!thread) fail('Clarification thread not found.', 404);
        if (thread.status !== 'awaiting_patient') fail('This question is no longer waiting for an answer.', 409);
        thread.messages.push(message('patient', req.user, answer));
        thread.status = 'awaiting_doctor'; thread.updatedAt = new Date().toISOString();
        return thread;
      });
      const reviews = await readReviews();
      for (const id of thread.recordIds || [thread.recordId]) {
        if (reviews[id]) { reviews[id].decision = 'clarification_answered'; reviews[id].updatedAt = thread.updatedAt; }
      }
      await writeReviews(reviews);
      res.json({ thread });
    } catch (error) { if (error.status) res.status(error.status).json({ error: error.message }); else next(error); }
  });
  app.get('/api/profile', authenticate, patientOnly, async (req, res, next) => {
    try {
      const profiles = await readProfiles();
      const profile = profiles[req.user.userId] || { details: {}, history: [] };
      const timeline = accountTimeline(profile, await readSessions(), req.user.userId);
      res.json({ ...profile, clarifications: profile.clarifications || [], account: { id: req.user.userId, name: req.user.name, email: req.user.email }, timeline });
    } catch (error) { next(error); }
  });
  app.put('/api/profile', authenticate, patientOnly, async (req, res, next) => {
    try {
      const input = req.body || {};
      const details = Object.fromEntries(['birthDate', 'sex', 'phone', 'bloodGroup', 'allergies', 'medications', 'conditions', 'notes'].map(key => [key, text(input[key], ['allergies', 'medications', 'conditions', 'notes'].includes(key) ? 3000 : 80)]));
      if (details.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(details.birthDate) || !validHistoryDate(details.birthDate))) return res.status(400).json({ error: 'Enter a valid date of birth.' });
      if (!['', 'Female', 'Male', 'Intersex', 'Prefer not to say'].includes(details.sex)) return res.status(400).json({ error: 'Choose a valid sex option.' });
      if (!['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(details.bloodGroup)) return res.status(400).json({ error: 'Choose a valid blood group.' });
      await update(req.user.userId, profile => { profile.details = details; });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  async function saveEvent(req, res, next) {
    let stored = [];
    let committed = false;
    try {
      const input = req.body || {};
      const event = { title: text(input.title, 200), date: text(input.date, 10), kind: text(input.kind, 30), notes: text(input.notes, 3000) };
      if (!event.title || !kinds.includes(event.kind) || !validHistoryDate(event.date)) return res.status(400).json({ error: 'Add a title, choose a category, and enter a date as YYYY, YYYY-MM, or YYYY-MM-DD (or leave it blank).' });
      const files = req.body?.attachmentIds?.length ? await resolveUploadedAttachments(req.body.attachmentIds, req.user.userId) : req.files || [];
      stored = await storeAttachments(files, attachmentDirectory);
      const result = await update(req.user.userId, profile => {
        if (req.params.id) {
          const existing = profile.history.find(item => item.id === req.params.id);
          if (!existing) return false;
          Object.assign(existing, event, { attachments: [...(existing.attachments || []), ...stored], updatedAt: new Date().toISOString() });
        } else profile.history.push({ ...event, attachments: stored, id: randomUUID(), createdAt: new Date().toISOString() });
        return true;
      });
      if (!result) return res.status(404).json({ error: 'History entry not found.' });
      committed = true;
      res.status(req.params.id ? 200 : 201).json({ ok: true });
    } catch (error) { if (error.status === 400) res.status(400).json({ error: error.message }); else next(error); }
    finally { if (!committed) await removeAttachments(stored, attachmentDirectory); }
  }
  app.post('/api/profile/history', authenticate, patientOnly, receiveAttachments, saveEvent);
  app.put('/api/profile/history/:id', authenticate, patientOnly, receiveAttachments, saveEvent);
  app.get('/api/profile/attachments/:id', authenticate, async (req, res, next) => {
    try {
      const profiles = await readProfiles();
      const allowed = req.user.role === 'Doctor' ? Object.values(profiles) : req.user.role === 'Patient' ? [profiles[req.user.userId]].filter(Boolean) : [];
      const attachment = allowed.flatMap(profile => profile.history || []).flatMap(event => event.attachments || []).find(item => item.id === req.params.id);
      if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });
      res.set('Cache-Control', 'private, no-store');
      res.set('X-Content-Type-Options', 'nosniff');
      if (supabaseConfigured()) return res.redirect(302, await signedDownload(attachment.id));
      res.type(attachment.mimeType);
      res.download(join(attachmentDirectory, attachment.id), attachment.name, error => { if (error && !res.headersSent) res.status(error.code === 'ENOENT' ? 404 : 500).json({ error: 'Attachment file could not be downloaded.' }); });
    } catch (error) { next(error); }
  });
  app.delete('/api/profile/history/:id/attachments/:attachmentId', authenticate, patientOnly, async (req, res, next) => {
    try {
      const removed = await update(req.user.userId, profile => {
        const event = profile.history.find(item => item.id === req.params.id);
        const index = event?.attachments?.findIndex(item => item.id === req.params.attachmentId) ?? -1;
        if (index < 0) return null;
        return event.attachments.splice(index, 1)[0];
      });
      if (!removed) return res.status(404).json({ error: 'Attachment not found.' });
      await removeAttachments([removed], attachmentDirectory);
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  app.delete('/api/profile/history/:id', authenticate, patientOnly, async (req, res, next) => {
    try {
      const found = await update(req.user.userId, profile => {
        const index = profile.history.findIndex(item => item.id === req.params.id);
        if (index < 0) return false;
        return profile.history.splice(index, 1)[0];
      });
      if (!found) return res.status(404).json({ error: 'History entry not found.' });
      await removeAttachments(found.attachments || [], attachmentDirectory);
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  return { ask, approve };
}
