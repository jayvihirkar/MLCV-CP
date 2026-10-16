import express from 'express';
import multer from 'multer';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = join(root, 'data', 'intakes.json');
const usersFile = join(root, 'data', 'users.json');
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
await ensureUsers();

async function readSessions() { return JSON.parse(await readFile(dataFile, 'utf8')); }
async function writeSessions(sessions) { await writeFile(dataFile, `${JSON.stringify(sessions, null, 2)}\n`); }
function findSession(sessions, id) { return sessions.find((session) => session.id === id); }

function hashPassword(password, salt) { return scryptSync(password, salt, 64).toString('hex'); }
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role }; }
function verifyPassword(password, user) {
  const candidate = Buffer.from(hashPassword(password, user.salt), 'hex');
  const expected = Buffer.from(user.passwordHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
async function readUsers() { return JSON.parse(await readFile(usersFile, 'utf8')); }
async function writeUsers(users) { await writeFile(usersFile, `${JSON.stringify(users, null, 2)}\n`); }

async function ensureUsers() {
  try { await access(usersFile, constants.F_OK); return; } catch {}
  const salt = randomBytes(16).toString('hex');
  const seeded = [{ id: randomUUID(), name: 'Ramesh Patel', email: 'ramesh.patel@example.com', role: 'Patient', salt, passwordHash: hashPassword('meditrace123', salt), createdAt: new Date().toISOString() }];
  await writeUsers(seeded);
}

function issueToken(user) {
  const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
  authTokens.set(token, { userId: user.id, name: user.name, email: user.email, role: user.role, expiresAt: Date.now() + tokenTtl });
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

app.get('/api/auth/session', authenticate, (req, res) => res.json({ user: { id: req.user.userId, name: req.user.name, email: req.user.email, role: req.user.role } }));

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

app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'The local server could not complete that request.' }); });

const dist = join(root, 'dist');
app.use(express.static(dist));
app.use((_req, res) => res.sendFile(join(dist, 'index.html')));
const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`MediTrace API listening on http://localhost:${port}`));
