// ---------------------------------------------------------------------------
// Gemini adapter (Google AI Studio, free tier)
//
// Used ONLY for two narrow, non-clinical tasks:
//   1. Selecting the most relevant next follow-up question from a fixed list.
//   2. Flagging warning signs already covered by the rules, when they appear in
//      free text.
//
// It never diagnoses, prescribes, or invents questions. If no key is set, or the
// request fails, the deterministic rules in triage.mjs carry on unchanged.
// ---------------------------------------------------------------------------

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const SYSTEM_INSTRUCTION = [
  'You are the intake assistant for MediTrace, a pre-visit history tool.',
  'You do NOT diagnose, prescribe, or give medical advice. You never invent new questions.',
  'Your only job is to (a) choose the single most relevant NEXT question from a fixed list, and',
  '(b) list any warning signs from a fixed list that the patient clearly reported in their latest answer.',
  'Always answer with JSON only. If unsure, choose the first candidate question that has not already been asked.',
].join(' ');

export function geminiConfigured() { return Boolean(process.env.GEMINI_API_KEY); }
export function geminiModel() { return process.env.GEMINI_MODEL || 'gemini-2.5-flash'; }
export function geminiSttModel() { return process.env.GEMINI_STT_MODEL || 'gemini-3.5-transcribe'; }

// Bias speech recognition toward medicine names and clinical terms that are
// routinely mangled by generic speech models (especially Indian brand names and
// accents). Extend or override with GEMINI_STT_VOCABULARY (comma-separated).
const DEFAULT_VOCABULARY = [
  'Crocin', 'Disprin', 'Dolo', 'Dolo 650', 'Combiflam', 'Calpol', 'Paracetamol', 'Ibuprofen', 'Aspirin',
  'Ecosprin', 'Clopidogrel', 'Warfarin', 'Augmentin', 'Azithromycin', 'Amoxicillin', 'Ciprofloxacin',
  'Metformin', 'Glycomet', 'Glimepiride', 'Januvia', 'Insulin', 'Thyronorm', 'Eltroxin',
  'Amlodipine', 'Telmisartan', 'Telma', 'Losartan', 'Atenolol', 'Metoprolol', 'Atorvastatin', 'Rosuvastatin',
  'Pantoprazole', 'Pan-D', 'Omeprazole', 'Ranitidine', 'Gelusil', 'Digene', 'ORS',
  'Cetirizine', 'Levocetirizine', 'Montelukast', 'Salbutamol', 'Asthalin', 'Deriphyllin',
  'Zerodol', 'Meftal', 'Voveran', 'Drotin', 'Buscopan', 'Neurobion', 'Shelcal', 'Vitamin D3', 'Calcium',
];

export function sttVocabulary() {
  const extra = String(process.env.GEMINI_STT_VOCABULARY || '').split(',').map((term) => term.trim()).filter(Boolean);
  return [...new Set([...DEFAULT_VOCABULARY, ...extra])];
}

/**
 * Speech-to-text via Gemini. Accepts the browser recording directly (audio/webm
 * is a supported input format). Returns { text } on success, { unconfigured: true }
 * when no key is set, or { status, detail } when the upstream call fails.
 */
export async function transcribeWithGemini({ buffer, mimeType = 'audio/webm', languageCode = null }) {
  if (!geminiConfigured()) return { unconfigured: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const audioTranscriptionConfig = { mode: 'SMART', customVocabulary: sttVocabulary() };
    if (languageCode) audioTranscriptionConfig.languageCodes = [languageCode];
    const response = await fetch(`${API_BASE}/${geminiSttModel()}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: Buffer.from(buffer).toString('base64') } }] }],
        generationConfig: { audioTranscriptionConfig },
      }),
    });
    if (!response.ok) return { status: response.status, detail: await response.text() };
    const payload = await response.json();
    const parts = payload?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((part) => part.text || part.audioTranscription?.text || '').join('').trim();
    return { text };
  } catch (error) {
    return { status: 504, detail: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    nextQuestionId: { type: 'STRING', description: 'id of the chosen next question from the provided candidate list' },
    redFlagIds: { type: 'ARRAY', items: { type: 'STRING' }, description: 'ids of any clearly reported warning signs, from the provided list only' },
    normalisedDuration: { type: 'STRING', description: 'short normalised duration if the patient stated one, else empty' },
  },
  required: ['nextQuestionId'],
};

async function callGemini(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(`${API_BASE}/${geminiModel()}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') || '';
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decide the next question and surface any reported warning signs.
 * Returns null when the model is unavailable so the caller falls back to rules.
 */
export async function analyseTurn({ state, question, answerText, candidates, redFlags }) {
  if (!geminiConfigured() || !candidates.length) return null;
  const candidateList = candidates.map((item) => `- ${item.id}: ${item.text}`).join('\n');
  const redFlagList = redFlags.length ? redFlags.map((flag) => `- ${flag.id}: ${flag.label}`).join('\n') : '(none)';
  const prompt = [
    `Chief complaint category: ${state.complaintLabel || 'unknown'}.`,
    `Patient's stated problem: "${state.chiefComplaint || ''}"`,
    `Already asked (do NOT pick these again): ${state.askedQuestions.join(', ') || 'none'}.`,
    `Question just asked (id ${question.id}): "${question.text}"`,
    `Patient's latest answer: "${String(answerText).slice(0, 500)}"`,
    '',
    'Candidate next questions (choose exactly one id):',
    candidateList,
    '',
    'Warning-sign options (list only those clearly reported):',
    redFlagList,
  ].join('\n');
  const result = await callGemini(prompt);
  if (!result) return null;
  const validIds = new Set(candidates.map((item) => item.id));
  const nextQuestionId = validIds.has(result.nextQuestionId) ? result.nextQuestionId : candidates[0].id;
  const redFlagIds = Array.isArray(result.redFlagIds)
    ? result.redFlagIds.filter((id) => redFlags.some((flag) => flag.id === id))
    : [];
  return { nextQuestionId, redFlagIds, normalisedDuration: result.normalisedDuration || null };
}
