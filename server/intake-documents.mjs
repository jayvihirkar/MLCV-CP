import { receiveAttachments, resolveUploadedAttachments, storeAttachments, removeAttachments } from './attachments.mjs';

export function registerIntakeDocumentRoutes(app, { authenticate, readSessions, writeSessions, directory, documentPipeline }) {
  const own = (sessions, req) => sessions.find(session => session.id === req.params.id && session.userId === req.user.userId);
  app.get('/api/sessions/:id/documents', authenticate, async (req, res) => {
    const session = own(await readSessions(), req);
    if (!session) return res.status(404).json({ error: 'Intake session not found.' });
    res.json({ documents: session.documents || [], submittedAt: session.submittedAt || null });
  });
  app.post('/api/sessions/:id/documents', authenticate, receiveAttachments, async (req, res) => {
    if (req.user.role !== 'Patient') return res.status(403).json({ error: 'Only patient accounts can upload intake documents.' });
    let stored = [], committed = false;
    try {
      // Authorize before consuming upload tickets or storing any file.
      const initial = own(await readSessions(), req);
      if (!initial) return res.status(404).json({ error: 'Intake session not found.' });
      const files = req.body?.attachmentIds?.length ? await resolveUploadedAttachments(req.body.attachmentIds, req.user.userId) : req.files || [];
      if (!files.length) return res.status(400).json({ error: 'Choose at least one document to upload.' });
      if ((initial.documents || []).length + files.length > 50) return res.status(400).json({ error: 'An intake can contain up to 50 documents.' });
      stored = await storeAttachments(files, directory);
      // Read again after file I/O so another request cannot be overwritten.
      const sessions = await readSessions();
      const session = own(sessions, req);
      if (!session) return res.status(404).json({ error: 'Intake session not found.' });
      if ((session.documents || []).length + stored.length > 50) return res.status(409).json({ error: 'The document limit changed. Reload your documents and try again.' });
      session.documents = [...(session.documents || []), ...stored];
      session.updatedAt = new Date().toISOString();
      await writeSessions(sessions);
      committed = true;
      const extractions = await documentPipeline.enqueueMany(req.user.userId, stored, files, { demoScenario: session.demoScenario });
      const byId = new Map(extractions.map(item => [item.id, item]));
      res.status(201).json({ documents: session.documents.map(item => ({ ...item, ...(byId.has(item.id) ? { extraction: byId.get(item.id) } : {}) })), added: stored.length });
    } finally { if (!committed) await removeAttachments(stored, directory); }
  });
  app.delete('/api/sessions/:id/documents/:documentId', authenticate, async (req, res) => {
    const sessions = await readSessions();
    const session = own(sessions, req);
    const index = session?.documents?.findIndex(item => item.id === req.params.documentId) ?? -1;
    if (index < 0) return res.status(404).json({ error: 'Document not found.' });
    const [removed] = session.documents.splice(index, 1);
    session.updatedAt = new Date().toISOString();
    await writeSessions(sessions);
    await removeAttachments([removed], directory);
    res.json({ documents: session.documents });
  });
}
