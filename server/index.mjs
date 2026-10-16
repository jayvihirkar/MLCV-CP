import express from 'express';
import multer from 'multer';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mockPatients, mockDoctorProfiles } from './mock-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = join(root, 'data', 'intakes.json');
const usersFile = join(root, 'data', 'users.json');
const reviewsFile = join(root, 'data', 'reviews.json');
const voiceId = '7qBNUtXRGP0jPi0H4r8k';
const tokenTtl = 1000 * 60 * 60 * 8;
const authTokens = new Map();
const googleStates = new Map();
const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
function googleRedirectUri(req) { return process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/auth/google/callback`; }

function loadEnvironment() {
  try {
    const values = readFile(join(root, '.env'), 'utf8');
    return values.then((content) => {
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      }
    }).catch(() => {});
  } catch { return Promise.resolve(); }
}

await loadEnvironment();
await mkdir(dirname(dataFile), { recursive: true });
try { await access(dataFile, constants.F_OK); } catch { await writeFile(dataFile, '[]\n'); }
try { await access(reviewsFile, constants.F_OK); } catch { await writeFile(reviewsFile, '{}\n'); }
await ensureUsers();

async function readSessions() { return JSON.parse(await readFile(dataFile, 'utf8')); }
async function writeSessions(sessions) { await writeFile(dataFile, `${JSON.stringify(sessions, null, 2)}\n`); }
function findSession(sessions, id) { return sessions.find((session) => session.id === id); }

function hashPassword(password, salt) { return scryptSync(password, salt, 64).toString('hex'); }
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role, specialty: user.specialty || null }; }
function verifyPassword(password, user) {
  const candidate = Buffer.from(hashPassword(password, user.salt), 'hex');
  const expected = Buffer.from(user.passwordHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
async function readUsers() { return JSON.parse(await readFile(usersFile, 'utf8')); }
async function writeUsers(users) { await writeFile(usersFile, `${JSON.stringify(users, null, 2)}\n`); }

async function ensureUsers() {
  let users = [];
  try { users = JSON.parse(await readFile(usersFile, 'utf8')); } catch {}
  if (!Array.isArray(users)) users = [];
  const seeds = [
    { name: 'Ramesh Patel', email: 'ramesh.patel@example.com', role: 'Patient' },
    ...mockDoctorProfiles,
  ];
  let changed = false;
  for (const seed of seeds) {
    if (users.some((entry) => String(entry.email).toLowerCase() === seed.email.toLowerCase())) continue;
    const salt = randomBytes(16).toString('hex');
    users.push({ id: randomUUID(), ...seed, salt, passwordHash: hashPassword('meditrace123', salt), createdAt: new Date().toISOString() });
    changed = true;
  }
  if (changed || !users.length) await writeUsers(users);
}

function issueToken(user) {
  const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
  authTokens.set(token, { userId: user.id, name: user.name, email: user.email, role: user.role, specialty: user.specialty || null, expiresAt: Date.now() + tokenTtl });
  return token;
}

function readToken(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function authenticate(req, res, next) {
  const token = readToken(req);
  const record = token && authTokens.get(token);
  if (!record || record.expiresAt < Date.now()) {
    if (record) authTokens.delete(token);
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
  req.user = record;
  req.token = token;
  next();
}

function requireDoctor(req, res, next) {
  if (req.user?.role !== 'Doctor') return res.status(403).json({ error: 'This area is available to clinicians only.' });
  next();
}

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, elevenLabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY), googleConfigured: googleConfigured(), voiceId }));

app.get('/api/auth/providers', (_req, res) => res.json({ google: googleConfigured() }));

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Please enter your email and password.' });
    const user = (await readUsers()).find((entry) => entry.email.toLowerCase() === email);
    if (!user || !user.passwordHash || !verifyPassword(password, user)) return res.status(401).json({ error: 'The email or password you entered is incorrect.' });
    res.json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) { next(error); }
});

app.get('/api/auth/session', authenticate, (req, res) => res.json({ user: { id: req.user.userId, name: req.user.name, email: req.user.email, role: req.user.role, specialty: req.user.specialty || null } }));

app.post('/api/auth/logout', authenticate, (req, res) => { authTokens.delete(req.token); res.json({ ok: true }); });

app.get('/api/auth/google', (req, res) => {
  if (!googleConfigured()) return res.status(503).json({ error: 'Google sign-in is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.' });
  const state = randomUUID().replace(/-/g, '');
  googleStates.set(state, Date.now() + 10 * 60 * 1000);
  const params = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: googleRedirectUri(req), response_type: 'code', scope: 'openid email profile', state, access_type: 'online', prompt: 'select_account' });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get('/api/auth/google/callback', async (req, res, next) => {
  try {
    if (!googleConfigured()) return res.status(503).send('Google sign-in is not configured.');
    const { code, state, error } = req.query;
    if (error) return res.redirect('/?auth_error=google');
    const validState = state && googleStates.get(String(state));
    if (!validState || validState < Date.now()) return res.redirect('/?auth_error=google');
    googleStates.delete(String(state));
    if (!code) return res.redirect('/?auth_error=google');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: String(code), client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: googleRedirectUri(req), grant_type: 'authorization_code' }),
    });
    if (!tokenResponse.ok) return res.redirect('/?auth_error=google');
    const tokens = await tokenResponse.json();
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!profileResponse.ok) return res.redirect('/?auth_error=google');
    const profile = await profileResponse.json();
    const email = String(profile.email || '').trim().toLowerCase();
    if (!email || profile.email_verified === false) return res.redirect('/?auth_error=google');
    const users = await readUsers();
    let user = users.find((entry) => entry.email.toLowerCase() === email);
    if (!user) {
      user = { id: randomUUID(), name: profile.name || email.split('@')[0], email, role: 'Patient', provider: 'google', createdAt: new Date().toISOString() };
      users.push(user);
      await writeUsers(users);
    }
    res.redirect(`/?auth_token=${encodeURIComponent(issueToken(user))}`);
  } catch (error) { next(error); }
});

app.post('/api/sessions', authenticate, async (req, res, next) => {
  try {
    const sessions = await readSessions();
    const session = { id: crypto.randomUUID(), patient: req.body.patient || 'Guest patient', locale: req.body.locale || 'en-IN', responses: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    sessions.push(session);
    await writeSessions(sessions);
    res.status(201).json(session);
  } catch (error) { next(error); }
});

app.get('/api/sessions/:id', authenticate, async (req, res, next) => {
  try {
    const session = findSession(await readSessions(), req.params.id);
    if (!session) return res.status(404).json({ error: 'Intake session not found.' });
    res.json(session);
  } catch (error) { next(error); }
});

app.put('/api/sessions/:id/responses/:questionId', authenticate, async (req, res, next) => {
  try {
    const answer = String(req.body.answer || '').trim();
    if (!answer || answer.length > 2000) return res.status(400).json({ error: 'A response of up to 2,000 characters is required.' });
    const sessions = await readSessions();
    const session = findSession(sessions, req.params.id);
    if (!session) return res.status(404).json({ error: 'Intake session not found.' });
    const response = { questionId: req.params.questionId, label: String(req.body.label || 'Response'), answer, locale: String(req.body.locale || session.locale), updatedAt: new Date().toISOString() };
    const oldIndex = session.responses.findIndex((item) => item.questionId === response.questionId);
    if (oldIndex === -1) session.responses.push(response); else session.responses[oldIndex] = response;
    session.updatedAt = new Date().toISOString();
    await writeSessions(sessions);
    res.json(session);
  } catch (error) { next(error); }
});

app.post('/api/narration', authenticate, async (req, res, next) => {
  try {
    if (!process.env.ELEVENLABS_API_KEY) return res.status(503).json({ error: 'ElevenLabs is not configured. Add ELEVENLABS_API_KEY to .env and restart the app.' });
    const text = String(req.body.text || '').trim();
    if (!text || text.length > 5000) return res.status(400).json({ error: 'Narration text is required.' });
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.58, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
    });
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'ElevenLabs narration failed.', detail: await upstream.text() });
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) { next(error); }
});

app.post('/api/transcribe', authenticate, upload.single('audio'), async (req, res, next) => {
  try {
    if (!process.env.ELEVENLABS_API_KEY) return res.status(503).json({ error: 'ElevenLabs is not configured. Add ELEVENLABS_API_KEY to .env and restart the app.' });
    if (!req.file) return res.status(400).json({ error: 'Audio is required.' });
    const form = new FormData();
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' }), 'response.webm');
    form.append('model_id', 'scribe_v2');
    const upstream = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, body: form });
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'ElevenLabs transcription failed.', detail: await upstream.text() });
    const transcript = await upstream.json();
    res.json({ text: transcript.text || '', language: transcript.language_code || null });
  } catch (error) { next(error); }
});

// ---------------------------------------------------------------------------
// Clinician (doctor) workspace API
// ---------------------------------------------------------------------------

async function readReviews() {
  try {
    const parsed = JSON.parse(await readFile(reviewsFile, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
async function writeReviews(reviews) { await writeFile(reviewsFile, `${JSON.stringify(reviews, null, 2)}\n`); }

function todayAt(time, dayOffset = 0) {
  const base = new Date();
  base.setDate(base.getDate() + dayOffset);
  const [hours, minutes] = String(time).split(':').map(Number);
  base.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return base.toISOString();
}
function hoursAgoISO(hours) { return new Date(Date.now() - Math.max(0, Number(hours) || 0) * 3600 * 1000).toISOString(); }

function mockRecord(patient) {
  return {
    id: patient.id,
    demo: true,
    source: 'mock',
    name: patient.name,
    age: patient.age,
    sex: patient.sex,
    phone: patient.phone,
    city: patient.city,
    language: patient.language,
    doctor: patient.doctor,
    reason: patient.reason,
    priority: patient.priority,
    status: patient.status,
    appointment: todayAt(patient.appointmentTime, patient.dayOffset),
    submittedAt: hoursAgoISO(patient.submittedHoursAgo),
    overview: patient.overview,
    summary: {
      generatedAt: hoursAgoISO(patient.submittedHoursAgo),
      model: 'MediTrace structured extractor (demo draft)',
      sections: patient.summarySections.map((section) => ({ ...section })),
    },
    timeline: patient.timeline,
    flags: patient.flags,
    evidence: patient.evidence,
    documents: patient.documents,
    clarification: patient.clarification,
    intake: patient.intake,
  };
}

function realRecord(session) {
  const responses = Array.isArray(session.responses) ? session.responses : [];
  const answer = (id) => String(responses.find((item) => item.questionId === id)?.answer || '').trim();
  const evByQuestion = {};
  const evidence = responses.map((item, index) => {
    const id = `ev-${String(session.id).slice(0, 8)}-${index + 1}`;
    evByQuestion[item.questionId] = id;
    return { id, label: item.label || item.questionId, kind: 'response', sourceLabel: 'Patient response', date: item.updatedAt || session.updatedAt, excerpt: item.answer };
  });
  const sourcesFor = (id) => (evByQuestion[id] ? [evByQuestion[id]] : []);
  const missing = [];
  if (!answer('when-started')) missing.push('When it started');
  if (!answer('severity')) missing.push('Severity');
  if (!answer('anything-else')) missing.push('Additional notes');
  missing.push('Allergies', 'Medications', 'Past medical history');
  const completed = Boolean(answer('main-concern') && answer('when-started') && answer('severity') && answer('anything-else'));
  const severityNumber = Number((answer('severity').match(/\d+/) || [])[0]);
  const priority = Number.isFinite(severityNumber) && severityNumber >= 7 ? 'high' : 'medium';
  const flags = [];
  if (!responses.length) {
    flags.push({ id: 'fl-intake-empty', title: 'No intake captured', detail: 'This intake session has no recorded responses yet.', why: 'Nothing could be summarised until the patient provides responses.', kind: 'ai_inference', severity: 'medium', sourceLabel: 'Intake completeness check', evidenceId: null });
  } else if (!completed) {
    flags.push({ id: 'fl-intake-incomplete', title: 'Incomplete intake', detail: `Missing: ${missing.slice(0, 3).join(', ')}.`, why: 'Some sections are incomplete and may need to be gathered at the visit.', kind: 'ai_inference', severity: 'medium', sourceLabel: 'Intake completeness check', evidenceId: null });
  }
  if (Number.isFinite(severityNumber) && severityNumber >= 7) {
    flags.push({ id: 'fl-severity-high', title: 'High reported severity', detail: `Patient reported severity of ${severityNumber}/10.`, why: 'A high self-reported severity may warrant prioritisation. This is a patient estimate, not a clinical score.', kind: 'patient_reported', severity: 'high', sourceLabel: 'Patient response', evidenceId: sourcesFor('severity')[0] || null });
  }
  return {
    id: `INTAKE-${String(session.id).slice(0, 8)}`,
    demo: false,
    source: 'intake',
    name: session.patient || 'Patient',
    age: null,
    sex: null,
    phone: null,
    city: null,
    language: session.locale || 'en-IN',
    doctor: null,
    reason: answer('main-concern') || 'Not provided',
    priority,
    status: completed ? 'awaiting_review' : 'incomplete',
    appointment: session.createdAt,
    submittedAt: session.updatedAt,
    overview: { chiefComplaint: answer('main-concern') || null, allergies: [], medications: [], conditions: [], notes: answer('anything-else') || null },
    summary: {
      generatedAt: session.updatedAt,
      model: 'MediTrace structured extractor (from patient responses)',
      sections: [
        { id: 'chief-complaint', title: 'Chief complaint', body: answer('main-concern') || 'Not provided', sources: sourcesFor('main-concern') },
        { id: 'when-started', title: 'When it started', body: answer('when-started') || 'Not provided', sources: sourcesFor('when-started') },
        { id: 'severity', title: 'Reported severity', body: answer('severity') || 'Not provided', sources: sourcesFor('severity') },
        { id: 'additional-notes', title: 'Additional notes', body: answer('anything-else') || 'Not provided', sources: sourcesFor('anything-else') },
        { id: 'history', title: 'Medical history & medications', body: 'Not provided — the intake did not collect this section.', sources: [] },
      ],
    },
    timeline: [{ id: `tl-${String(session.id).slice(0, 8)}`, date: session.createdAt, type: 'intake', title: 'Voice intake session', detail: completed ? 'All four intake questions were answered.' : 'The intake was not completed.', sourceLabel: 'Intake session', evidenceId: null }],
    flags,
    evidence,
    documents: [],
    clarification: [],
    intake: { completed, missing, responses, documents: [] },
  };
}

function buildRecordIndex(sessions) {
  return [...mockPatients.map(mockRecord), ...sessions.map(realRecord)];
}

function emptyReview(id) { return { patientId: id, sections: {}, decision: null, note: '', updatedAt: null, approvedAt: null }; }

function toQueueItem(record, reviews) {
  const review = reviews[record.id];
  const decision = review?.decision || null;
  const highFlag = record.flags.some((flag) => flag.severity === 'high');
  const status = decision === 'approved' ? 'reviewed' : record.status;
  return {
    id: record.id,
    name: record.name,
    age: record.age,
    sex: record.sex,
    appointment: record.appointment,
    submittedAt: record.submittedAt,
    status,
    priority: record.priority,
    source: record.source,
    demo: record.demo,
    doctor: record.doctor,
    reason: record.reason,
    completed: record.intake.completed,
    flagCount: record.flags.length,
    highFlag,
    decision,
    documents: record.documents,
  };
}

app.get('/api/doctor/overview', authenticate, requireDoctor, async (_req, res, next) => {
  try {
    const [sessions, reviews] = await Promise.all([readSessions(), readReviews()]);
    const records = buildRecordIndex(sessions);
    const queue = records.map((record) => toQueueItem(record, reviews)).sort((a, b) => new Date(a.appointment) - new Date(b.appointment));
    const stats = {
      total: queue.length,
      awaiting: queue.filter((item) => item.status === 'awaiting_review' || item.status === 'in_review').length,
      reviewed: queue.filter((item) => item.status === 'reviewed').length,
      flagged: queue.filter((item) => item.highFlag).length,
      incomplete: queue.filter((item) => item.status === 'incomplete').length,
      demo: queue.filter((item) => item.demo).length,
    };
    res.json({ stats, queue, generatedAt: new Date().toISOString() });
  } catch (error) { next(error); }
});

app.get('/api/doctor/patients/:id', authenticate, requireDoctor, async (req, res, next) => {
  try {
    const [sessions, reviews] = await Promise.all([readSessions(), readReviews()]);
    const record = buildRecordIndex(sessions).find((item) => item.id === req.params.id);
    if (!record) return res.status(404).json({ error: 'Patient record not found.' });
    const review = reviews[record.id] || emptyReview(record.id);
    record.summary.sections = record.summary.sections.map((section) => ({ ...section, review: review.sections?.[section.id] || { status: 'pending', doctorText: null, updatedAt: null } }));
    record.review = { decision: review.decision || null, note: review.note || '', updatedAt: review.updatedAt || null, approvedAt: review.approvedAt || null };
    res.json({ patient: record });
  } catch (error) { next(error); }
});

app.put('/api/doctor/patients/:id/summary', authenticate, requireDoctor, async (req, res, next) => {
  try {
    const incoming = Array.isArray(req.body.sections) ? req.body.sections : null;
    if (!incoming) return res.status(400).json({ error: 'A list of summary sections is required.' });
    const reviews = await readReviews();
    const review = reviews[req.params.id] || emptyReview(req.params.id);
    review.sections = review.sections || {};
    for (const section of incoming) {
      if (!section || typeof section.id !== 'string') continue;
      review.sections[section.id] = {
        doctorText: typeof section.doctorText === 'string' ? section.doctorText.slice(0, 8000) : null,
        status: section.status === 'reviewed' ? 'reviewed' : 'pending',
        updatedAt: new Date().toISOString(),
      };
    }
    if (review.decision === 'approved') { review.decision = 'draft'; review.approvedAt = null; }
    review.updatedAt = new Date().toISOString();
    reviews[req.params.id] = review;
    await writeReviews(reviews);
    res.json({ review });
  } catch (error) { next(error); }
});

app.post('/api/doctor/patients/:id/decision', authenticate, requireDoctor, async (req, res, next) => {
  try {
    const action = String(req.body.action || '');
    if (!['draft', 'approve', 'clarification'].includes(action)) return res.status(400).json({ error: 'Unsupported review action.' });
    const reviews = await readReviews();
    const review = reviews[req.params.id] || emptyReview(req.params.id);
    review.sections = review.sections || {};
    review.note = String(req.body.note || '').slice(0, 2000);
    review.updatedAt = new Date().toISOString();
    if (action === 'approve') {
      review.decision = 'approved';
      review.approvedAt = review.updatedAt;
      for (const section of Object.values(review.sections)) section.status = 'reviewed';
    } else if (action === 'clarification') {
      review.decision = 'clarification_requested';
      review.approvedAt = null;
    } else {
      review.decision = 'draft';
      review.approvedAt = null;
    }
    reviews[req.params.id] = review;
    await writeReviews(reviews);
    res.json({ review });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'The local server could not complete that request.' }); });

const dist = join(root, 'dist');
app.use(express.static(dist));
app.use((_req, res) => res.sendFile(join(dist, 'index.html')));
const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`MediTrace API listening on http://localhost:${port}`));
