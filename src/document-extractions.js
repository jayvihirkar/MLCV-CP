import './document-extractions.css';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const labels = { not_started: 'Starting extraction', not_configured: 'Extraction unavailable', queued: 'Queued', running: 'Reading document', completed: '✓ Extraction complete — review results', failed: 'Extraction needs a retry' };
export function documentExtractionPanel(item) {
  if (item.demo || !item.mimeType) return '';
  return `<details class="document-extraction" data-document-extraction="${escape(item.id)}" open><summary>Document extraction <span data-extraction-status>${escape(labels[item.extraction?.status] || 'Checking status')}</span></summary><div data-extraction-body><p>Checking document processing…</p></div></details>`;
}

function resultHtml(payload, id, doctor) {
  const button = `<button type="button" class="attachment-button" data-process-document="${escape(id)}">Retry extraction</button>`;
  if (payload.status === 'not_configured') return '<p>Document extraction is not configured. Your original file is saved and available to download.</p>';
  if (payload.status === 'failed') return `<p role="status">${escape(payload.error || 'Could not extract this document. The original is saved.')}</p>${button}`;
  if (payload.status === 'not_started') return '<p role="status">Starting extraction automatically. No extra action is needed.</p>';
  if (payload.status !== 'completed') {
    const elapsed = payload.startedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(payload.startedAt)) / 1000)) : 0;
    const duration = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;
    const remoteOcr = /Google Cloud Vision|OCR\.space/i.test(payload.progress || '');
    const providerNote = remoteOcr ? 'A hosted OCR service is processing this page.' : 'Local OCR may take several minutes on its first use while models download.';
    return `<div class="extraction-progress" role="status"><span class="extraction-spinner" aria-hidden="true"></span><strong>${escape(payload.progress || (payload.status === 'queued' ? 'Waiting for the document worker' : 'Reading your document'))}</strong></div><p>${payload.queuePosition ? `Queue position: ${escape(payload.queuePosition)}. ` : ''}${payload.startedAt ? `Elapsed: ${duration}. ` : ''}${providerNote} You can leave and return later.</p><button type="button" class="attachment-button" data-check-extraction="${escape(id)}">Check status</button>`;
  }
  const result = payload.result;
  if (!result) return '<p>Open the document again to load its extracted findings.</p>';
  const review = payload.review ? `<p class="extraction-reviewed">Extraction reviewed by ${escape(payload.review.doctorName)}. This does not approve the intake summary.</p>` : `<p>These are unverified document mentions. Negation, history, and active medication use have not been determined.</p>${doctor ? `<button type="button" class="attachment-button" data-review-extraction="${escape(id)}">Mark extraction reviewed</button>` : ''}`;
  return `${review}<p class="extraction-models">OCR: ${escape(result.models.ocr)} · Medical NLP: ${escape(result.models.nlp)}</p>${result.warnings.length ? `<ul class="extraction-warnings">${result.warnings.map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : ''}${result.pages.map(page => `<section class="extraction-page"><h4>Page / section ${page.number} <small>${escape({ trocr: 'Handwriting OCR', google_vision: 'Google Vision OCR', ocr_space: 'OCR.space OCR', pdf_text: 'PDF text layer', docx_text: 'Word text', docx_image: 'Embedded image OCR' }[page.method])}</small></h4><details><summary>View extracted source text</summary><pre>${escape(page.text || 'No readable text detected.')}</pre></details>${page.entities.length ? `<div class="extraction-table-scroll"><table><caption>Medical term mentions. Model scores are not clinical confidence.</caption><thead><tr><th>Term</th><th>Type</th><th>Model score</th><th>Source context</th></tr></thead><tbody>${page.entities.map(entity => `<tr><td>${escape(entity.text)}</td><td>${escape(entity.label)}</td><td>${Math.round(entity.score * 100)}%</td><td>${escape(page.text.slice(Math.max(0, entity.start - 70), Math.min(page.text.length, entity.end + 100)))}</td></tr>`).join('')}</tbody></table></div>` : '<p>No medical entities identified on this page.</p>'}</section>`).join('')}`;
}

const token = () => sessionStorage.getItem('meditrace.token') || localStorage.getItem('meditrace.token') || '';
const entries = new Map();
const seen = new WeakSet();
let accountToken = '';
let active = 0;
const waiting = [];
function limited(action) {
  return new Promise((resolve, reject) => {
    waiting.push(async () => { active++; try { resolve(await action()); } catch (error) { reject(error); } finally { active--; drain(); } });
    drain();
  });
}
function drain() { while (active < 2 && waiting.length) waiting.shift()(); }
function render(id, payload, message = '') {
  for (const panel of document.querySelectorAll('[data-document-extraction]')) {
    if (panel.dataset.documentExtraction !== id) continue;
    panel.dataset.extractionState = payload.status;
    panel.querySelector('[data-extraction-status]').textContent = payload.review ? 'Extraction reviewed' : labels[payload.status] || 'Checking status';
    panel.querySelector('[data-extraction-body]').innerHTML = resultHtml(payload, id, document.body.classList.contains('is-doctor')) + (message ? `<p role="status">${escape(message)}</p>` : '');
  }
}
async function refresh(id, action = '') {
  const auth = token();
  if (!auth) return;
  if (auth !== accountToken) { entries.clear(); accountToken = auth; }
  let entry = entries.get(id);
  if (!entry) { entry = {}; entries.set(id, entry); }
  if (entry.busy) return;
  entry.busy = true;
  try {
    await limited(async () => {
      if (auth !== token()) return;
      const base = `/api/profile/attachments/${encodeURIComponent(id)}/extraction`;
      const request = async (path, method) => {
        const response = await fetch(path, { method, headers: { Authorization: `Bearer ${auth}` }, signal: AbortSignal.timeout(25000) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load document extraction.');
        return payload;
      };
      let payload = await request(action === 'review' ? `${base}/review` : base, action ? 'POST' : 'GET');
      entry.payload = payload;
      if (!action && payload.status === 'not_started' && payload.configured) payload = await request(base, 'POST');
      if (auth !== token()) return;
      entry.payload = payload;
      render(id, payload);
    });
  } catch (error) {
    if (auth === token()) {
      if (!entry.payload || entry.payload.status === 'not_started') entry.payload = { status: 'failed', error: error.message };
      render(id, entry.payload, entry.payload.error === error.message ? '' : error.message);
    }
  } finally { entry.busy = false; }
}
function scan() {
  for (const panel of document.querySelectorAll('[data-document-extraction]')) {
    if (seen.has(panel)) continue;
    seen.add(panel);
    const id = panel.dataset.documentExtraction;
    const cached = entries.get(id);
    if (accountToken === token() && cached?.payload) render(id, cached.payload);
    refresh(id);
  }
}
document.addEventListener('click', event => {
  const check = event.target.closest('[data-check-extraction]');
  if (check) { check.disabled = true; refresh(check.dataset.checkExtraction).finally(() => { check.disabled = false; }); return; }
  const process = event.target.closest('[data-process-document]');
  const review = event.target.closest('[data-review-extraction]');
  if (!process && !review) return;
  const button = process || review;
  button.disabled = true;
  refresh(process?.dataset.processDocument || review.dataset.reviewExtraction, review ? 'review' : 'start').finally(() => { button.disabled = false; });
});
new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
setInterval(() => {
  if (document.hidden || accountToken !== token()) return;
  const visible = new Set([...document.querySelectorAll('[data-document-extraction]')].map(panel => panel.dataset.documentExtraction));
  for (const [id, entry] of entries) if (visible.has(id) && ['queued', 'running'].includes(entry.payload?.status)) refresh(id);
}, 4000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) for (const panel of document.querySelectorAll('[data-document-extraction]')) refresh(panel.dataset.documentExtraction); });
scan();
