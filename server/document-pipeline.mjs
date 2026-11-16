import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { readJson, writeJson } from './persistence.mjs';
import { supabaseConfigured, downloadObject } from './supabase.mjs';

const MAX_TEXT = 30000;
const processing = new Set(['queued', 'running']);
const error = (message, status = 400) => Object.assign(new Error(message), { status });
export const documentPipelineConfigured = () => Boolean(process.env.DOCUMENT_PIPELINE_URL && process.env.DOCUMENT_PIPELINE_TOKEN);
export const extractionSummary = record => ({ status: record?.status || (documentPipelineConfigured() ? 'not_started' : 'not_configured'), updatedAt: record?.updatedAt || null, sourceSha256: record?.sourceSha256 || null, pageCount: record?.result?.pages.length || 0, entityCount: record?.result?.pages.reduce((sum, page) => sum + page.entities.length, 0) || 0, review: record?.review || null, error: record?.error || null });

function validDemoReport(report) {
  if (!report || typeof report !== 'object') return null;
  const text = value => typeof value === 'string' && value.length > 0 && value.length <= 300;
  const texts = value => Array.isArray(value) && value.length <= 12 && value.every(text);
  const values = value => Array.isArray(value) && value.length <= 12 && value.every(Number.isFinite);
  if (!text(report.document_type) || !text(report.hospital) || !text(report.report?.title) || !text(report.report?.report_id) || !text(report.report?.date) || !text(report.patient?.name) || !text(report.patient?.patient_id) || !Number.isInteger(report.patient?.age) || report.patient.age < 0 || report.patient.age > 130 || !text(report.patient?.sex) || !text(report.clinical_information?.chief_complaint) || !texts(report.clinical_information?.symptoms) || !texts(report.clinical_information?.medical_history) || !text(report.clinical_information?.allergies) || !Array.isArray(report.medications) || report.medications.length > 20 || !report.medications.every(item => text(item?.name) && text(item?.dosage) && text(item?.frequency)) || !Number.isInteger(report.pain_score?.value) || !Number.isInteger(report.pain_score?.scale) || !text(report.pain_score?.severity) || !texts(report.imaging) || !texts(report.findings) || !texts(report.impression) || !values(report.graphs?.pain_trend) || !values(report.graphs?.swelling_cm) || !texts(report.recommendations) || !text(report.doctor?.name) || !text(report.doctor?.qualification) || !text(report.doctor?.registration)) return null;
  return structuredClone(report);
}

function publicResult(record) {
  if (!record?.result) return null;
  if (record.demoScenario === 'citycare-knee-xray') return record.result;
  const { structuredReport, ...result } = record.result;
  return result;
}

async function provider(path, options = {}) {
  if (!documentPipelineConfigured()) throw error('Document extraction is not configured. Add the pipeline URL and token on the server.', 503);
  let response;
  try {
    response = await fetch(`${process.env.DOCUMENT_PIPELINE_URL.replace(/\/$/, '')}${path}`, { ...options, headers: { Authorization: `Bearer ${process.env.DOCUMENT_PIPELINE_TOKEN}`, ...options.headers }, signal: AbortSignal.timeout(options.method === 'DELETE' ? 3000 : 20000) });
  } catch { throw error('The document service is unavailable. The original file is saved; try again later.', 503); }
  if (response.status === 404 && !options.method) throw Object.assign(error('Processing job expired. Retry extraction from the saved original.', 410), { code: 'JOB_GONE' });
  if (response.status === 404 && options.method === 'DELETE') return null;
  if (!response.ok) throw error('The document service could not complete the request. The original file is saved; try again later.', 503);
  if (options.method === 'DELETE') return null;
  const payload = await response.json().catch(() => null);
  if (!payload || !['queued', 'running', 'completed', 'failed'].includes(payload.status) || !/^[a-zA-Z0-9_-]{1,128}$/.test(payload.id)) throw error('The document service returned an invalid job response.', 502);
  return payload;
}

// Store only grounded spans with valid offsets. Model scores are not clinical certainty.
export function validateExtraction(result) {
  if (!result || !Array.isArray(result.pages) || result.pages.length > 20 || !result.pages.length) throw error('The document service returned invalid extracted pages.', 502);
  let size = 0;
  const pages = result.pages.map((page, index) => {
    if (typeof page.text !== 'string' || (size += page.text.length) > MAX_TEXT || page.number !== index + 1 || !['trocr', 'google_vision', 'ocr_space', 'pdf_text', 'docx_text', 'docx_image'].includes(page.method) || !Array.isArray(page.entities) || page.entities.length > 500) throw error('The document service returned invalid page content.', 502);
    const entities = page.entities.map(entity => {
      if (!Number.isInteger(entity.start) || !Number.isInteger(entity.end) || entity.start < 0 || entity.end <= entity.start || entity.end > page.text.length || page.text.slice(entity.start, entity.end) !== entity.text || !Number.isFinite(entity.score) || entity.score < 0 || entity.score > 1 || typeof entity.label !== 'string' || entity.label.length > 80) throw error('The document service returned an entity without matching source text.', 502);
      return { text: entity.text, start: entity.start, end: entity.end, score: entity.score, label: entity.label, category: ['medication', 'condition', 'symptom', 'test', 'procedure', 'dose', 'frequency', 'other'].includes(entity.category) ? entity.category : 'other', assertion: 'not_assessed' };
    });
    return { number: page.number, method: page.method, text: page.text, entities };
  });
  const structuredReport = validDemoReport(result.structuredReport);
  return { pages, warnings: (Array.isArray(result.warnings) ? result.warnings : []).filter(item => typeof item === 'string').slice(0, 20).map(item => item.slice(0, 500)), models: { ocr: String(result.models?.ocr || 'TrOCR').slice(0, 200), nlp: String(result.models?.nlp || 'Medical NER').slice(0, 200) }, needsReview: true, ...(structuredReport ? { structuredReport } : {}) };
}

let pending = Promise.resolve();
export function changeExtraction(file, id, change) {
  const operation = pending.then(async () => {
    for (let attempt = 0; ; attempt++) {
      const records = await readJson(file, {});
      const next = change(records[id]);
      if (next === undefined) return records[id];
      if (next === null) delete records[id]; else records[id] = next;
      try { await writeJson(file, records); return next; }
      catch (failure) { if (failure.status !== 409 || attempt >= 2) throw failure; }
    }
  });
  pending = operation.catch(() => {});
  return operation;
}

export async function removeExtraction(file, id, strict = false) {
  if (strict) {
    const current = (await readJson(file, {}))[id];
    if (current?.jobId) await provider(`/jobs/${encodeURIComponent(current.jobId)}`, { method: 'DELETE' });
    await changeExtraction(file, id, () => null);
    return;
  }
  let previous;
  await changeExtraction(file, id, current => { previous = current; return null; });
  if (previous?.jobId && documentPipelineConfigured()) {
    try { await provider(`/jobs/${encodeURIComponent(previous.jobId)}`, { method: 'DELETE' }); }
    catch { console.warn('Document service cleanup pending; remove the retained job on that service.'); }
  }
}

export function registerDocumentRoutes(app, { authenticate, profileFile, readSessions }) {
  const extractionFile = join(dirname(profileFile), 'document-extractions.json');
  async function owned(req) {
    const profiles = await readJson(profileFile, {});
    const allowed = req.user.role === 'Doctor' ? Object.entries(profiles) : req.user.role === 'Patient' ? [[req.user.userId, profiles[req.user.userId]]] : [];
    for (const [userId, profile] of allowed) for (const event of profile?.history || []) {
      const item = (event.attachments || []).find(item => item.id === req.params.id);
      if (item) return { userId, item };
    }
    for (const session of await readSessions()) {
      if (req.user.role !== 'Doctor' && session.userId !== req.user.userId) continue;
      const item = (session.documents || []).find(item => item.id === req.params.id);
      if (item) return { userId: session.userId, item };
    }
    throw error('Attachment not found.', 404);
  }
  const read = async id => (await readJson(extractionFile, {}))[id];
  async function sync(id, record) {
    if (!record || !processing.has(record.status)) return record;
    let job;
    try { job = await provider(`/jobs/${encodeURIComponent(record.jobId)}`); }
    catch (failure) {
      if (failure.code !== 'JOB_GONE') throw failure;
      return changeExtraction(extractionFile, id, current => current?.jobId === record.jobId ? { ...current, status: 'failed', error: failure.message, updatedAt: new Date().toISOString() } : undefined);
    }
    if (job.id !== record.jobId) throw error('The document service returned a different job.', 502);
    let result;
    if (job.status === 'completed') {
      try { result = validateExtraction(job.result); }
      catch {
        try { await provider(`/jobs/${encodeURIComponent(record.jobId)}`, { method: 'DELETE' }); } catch { /* A later retry can still report the provider failure. */ }
        return changeExtraction(extractionFile, id, current => current?.jobId === record.jobId ? { ...current, status: 'failed', error: 'The extracted findings did not match their source text. Retry processing or inspect the original.', updatedAt: new Date().toISOString() } : undefined);
      }
    }
    const workerError = typeof job.error === 'string' ? job.error.slice(0, 500) : null;
    return changeExtraction(extractionFile, id, current => {
      if (!current || current.jobId !== record.jobId || !processing.has(current.status)) return undefined;
      return { ...current, status: job.status, progress: typeof job.progress === 'string' ? job.progress.slice(0, 240) : null, queuePosition: Number.isInteger(job.queuePosition) ? job.queuePosition : null, ...(result ? { result } : {}), error: job.status === 'failed' ? workerError || 'Extraction failed. The original is saved. Retry processing or review the document manually.' : null, updatedAt: new Date().toISOString() };
    });
  }
  const reply = (res, record) => res.json({ ...extractionSummary(record), progress: record?.progress || null, queuePosition: record?.queuePosition || null, startedAt: record?.startedAt || null, configured: documentPipelineConfigured(), result: publicResult(record) });
  async function start(userId, item, bytes, verify = async () => {}, context = {}) {
    const existing = await read(item.id);
    if (existing && existing.status !== 'failed') return sync(item.id, existing);
    if (!documentPipelineConfigured()) throw error('Document extraction is not configured. The original file is saved.', 503);
    try {
      bytes ||= supabaseConfigured() ? await downloadObject(item.id) : await readFile(join(dirname(profileFile), 'attachments', item.id));
      const body = new FormData();
      body.append('file', new Blob([bytes], { type: item.mimeType }), item.name);
      const digest = createHash('sha256').update(bytes).digest('hex');
      const key = createHash('sha256').update(`${userId}:${item.id}`).digest('hex');
      const job = await provider('/jobs', { method: 'POST', body, headers: { 'Idempotency-Key': key } });
      await verify();
      const result = job.status === 'completed' ? validateExtraction(job.result) : undefined;
      return await changeExtraction(extractionFile, item.id, current => current && current.status !== 'failed' ? undefined : ({ userId, jobId: job.id, status: job.status, startedAt: new Date().toISOString(), sourceSha256: digest, result, demoScenario: context.demoScenario === 'citycare-knee-xray' ? context.demoScenario : null, review: null, error: job.status === 'failed' ? (typeof job.error === 'string' ? job.error.slice(0, 500) : 'Extraction failed. Try processing again.') : null, updatedAt: new Date().toISOString() }));
    } catch (failure) {
      if (failure.status !== 404) await changeExtraction(extractionFile, item.id, current => current && current.status !== 'failed' ? undefined : ({ userId, status: 'failed', error: failure.message || 'Extraction could not start. Your document is saved; retry processing.', updatedAt: new Date().toISOString() }));
      throw failure;
    }
  }
  async function enqueueMany(userId, items, files = [], context = {}) {
    if (!documentPipelineConfigured()) return [];
    // Await fast job submission, never model inference or a detached Vercel task.
    // Reuse validated buffers to avoid downloading the just-uploaded files again.
    return Promise.all(items.map(async (item, index) => {
      try {
        const record = await start(userId, item, files[index]?.buffer, () => owned({ params: { id: item.id }, user: { role: 'Patient', userId } }), context);
        return { id: item.id, ...extractionSummary(record) };
      } catch {
        return { id: item.id, ...extractionSummary(await read(item.id)) };
      }
    }));
  }
  app.get('/api/profile/attachments/:id/extraction', authenticate, async (req, res) => {
    await owned(req);
    reply(res, await sync(req.params.id, await read(req.params.id)));
  });
  app.post('/api/profile/attachments/:id/extraction', authenticate, async (req, res) => {
    const { userId, item } = await owned(req);
    reply(res, await start(userId, item, undefined, () => owned(req)));
  });
  app.post('/api/profile/attachments/:id/extraction/review', authenticate, async (req, res) => {
    if (req.user.role !== 'Doctor') throw error('Only a clinician can mark an extraction reviewed.', 403);
    await owned(req);
    const record = await changeExtraction(extractionFile, req.params.id, current => {
      if (current?.status !== 'completed') throw error('Complete extraction before reviewing it.', 409);
      return { ...current, review: { at: new Date().toISOString(), doctorId: req.user.userId, doctorName: req.user.name } };
    });
    reply(res, record);
  });
  return { enqueueMany };
}
