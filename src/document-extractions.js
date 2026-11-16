import './document-extractions.css';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const labels = { not_started: 'Starting extraction', not_configured: 'Extraction unavailable', queued: 'Queued', running: 'Reading document', completed: '✓ Extraction complete — review results', failed: 'Extraction needs a retry' };
export function documentExtractionPanel(item) {
  if (item.demo || !item.mimeType) return '';
  return `<details class="document-extraction" data-document-extraction="${escape(item.id)}" open><summary>Document extraction <span data-extraction-status>${escape(labels[item.extraction?.status] || 'Checking status')}</span></summary><div data-extraction-body><p>Checking document processing…</p></div></details>`;
}

function metaHtml(payload) {
  const stamp = payload.updatedAt ? new Date(payload.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const bits = [
    stamp ? `Processed ${stamp}` : '',
    payload.pageCount ? `${payload.pageCount} page${payload.pageCount === 1 ? '' : 's'}` : '',
    payload.entityCount ? `${payload.entityCount} medical mention${payload.entityCount === 1 ? '' : 's'}` : '',
    payload.sourceSha256 ? `Source SHA-256 ${payload.sourceSha256.slice(0, 16)}…` : '',
  ].filter(Boolean);
  return bits.length ? `<p class="extraction-meta">${bits.map(escape).join(' · ')}</p>` : '';
}

function listHtml(items) {
  return Array.isArray(items) && items.length
    ? `<ul>${items.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`
    : '<p class="extraction-report-empty">Not provided.</p>';
}

function structuredReportHtml(report) {
  if (!report) return '';
  const clinical = report.clinical_information || {};
  const medications = Array.isArray(report.medications) ? report.medications : [];
  return `<details class="extraction-page extraction-report" open>
    <summary>Structured report (demo)</summary>
    <p class="extraction-report-note">This exact JSON is only enabled for the one-time CityCare X-ray demo session. Every field is machine-extracted and must be verified against the original before clinical use.</p>
    <div class="extraction-report-head">
      <div><b>${escape(report.hospital || 'Report')}</b><span>${escape(report.report?.title || report.document_type || 'Medical report')}</span></div>
      <div><span>${escape(report.report?.report_id || 'No report ID')}</span><span>${escape(report.report?.date || 'No report date')}</span></div>
    </div>
    <div class="extraction-report-facts">
      <div><span>Patient</span><b>${escape(report.patient?.name || 'Not provided')}</b><small>${escape(report.patient?.patient_id || 'No patient ID')}</small></div>
      <div><span>Age / sex</span><b>${escape(report.patient?.age ?? 'Not provided')}${report.patient?.age != null ? ' yrs' : ''}</b><small>${escape(report.patient?.sex || 'Not provided')}</small></div>
      <div><span>Pain score</span><b>${escape(report.pain_score?.value ?? 'Not provided')}${report.pain_score?.scale ? ` / ${escape(report.pain_score.scale)}` : ''}</b><small>${escape(report.pain_score?.severity || 'Not provided')}</small></div>
      <div><span>Clinician</span><b>${escape(report.doctor?.name || 'Not provided')}</b><small>${escape(report.doctor?.qualification || '')}${report.doctor?.registration ? ` · ${escape(report.doctor.registration)}` : ''}</small></div>
    </div>
    <section class="extraction-report-section">
      <h4>Clinical information</h4>
      <dl>
        <div><dt>Concern</dt><dd>${escape(clinical.chief_complaint || 'Not provided')}</dd></div>
        <div><dt>Symptoms</dt><dd>${listHtml(clinical.symptoms)}</dd></div>
        <div><dt>History</dt><dd>${listHtml(clinical.medical_history)}</dd></div>
        <div><dt>Allergies</dt><dd>${escape(clinical.allergies || 'Not provided')}</dd></div>
      </dl>
    </section>
    <section class="extraction-report-section">
      <h4>Medications</h4>
      ${medications.length ? `<ul>${medications.map(item => `<li><b>${escape(item.name || 'Medication')}</b> ${escape(item.dosage || '')} ${escape(item.frequency || '')}</li>`).join('')}</ul>` : '<p class="extraction-report-empty">Not provided.</p>'}
    </section>
    <section class="extraction-report-section">
      <h4>Imaging</h4>
      ${listHtml(report.imaging)}
    </section>
    <section class="extraction-report-section">
      <h4>Findings</h4>
      ${listHtml(report.findings)}
    </section>
    <section class="extraction-report-section">
      <h4>Impression</h4>
      ${listHtml(report.impression)}
    </section>
    <section class="extraction-report-section">
      <h4>Recommendations</h4>
      ${listHtml(report.recommendations)}
    </section>
    <details class="extraction-raw"><summary>View raw structured JSON</summary><pre>${escape(JSON.stringify(report, null, 2))}</pre></details>
  </details>`;
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
  const review = payload.review ? `<p class="extraction-reviewed">Extraction reviewed by ${escape(payload.review.doctorName)}. This does not approve the intake summary.</p>` : `<p>These are unverified document mentions. Negation, history, and active medication use have not been determined. Review the original before use.</p>${doctor ? `<button type="button" class="attachment-button" data-review-extraction="${escape(id)}">Mark extraction reviewed</button>` : ''}`;
  const structured = structuredReportHtml(result.structuredReport);
  return `${metaHtml(payload)}${review}<p class="extraction-models">OCR: ${escape(result.models.ocr)} · Medical NLP: ${escape(result.models.nlp)}</p>${result.warnings.length ? `<ul class="extraction-warnings">${result.warnings.map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : ''}${structured}${result.pages.map(page => `<section class="extraction-page"><h4>Page / section ${page.number} <small>${escape({ trocr: 'Handwriting OCR', google_vision: 'Google Vision OCR', ocr_space: 'OCR.space OCR', pdf_text: 'PDF text layer', docx_text: 'Word text', docx_image: 'Embedded image OCR' }[page.method])}</small></h4><details><summary>View extracted source text</summary><pre>${escape(page.text || 'No readable text detected.')}</pre></details>${page.entities.length ? `<div class="extraction-table-scroll"><table><caption>Medical term mentions. Model scores are not clinical confidence.</caption><thead><tr><th>Term</th><th>Type</th><th>Model score</th><th>Source context</th></tr></thead><tbody>${page.entities.map(entity => `<tr><td>${escape(entity.text)}</td><td>${escape(entity.label)}</td><td>${Math.round(entity.score * 100)}%</td><td>${escape(page.text.slice(Math.max(0, entity.start - 70), Math.min(page.text.length, entity.end + 100)))}</td></tr>`).join('')}</tbody></table></div>` : '<p>No medical entities identified on this page.</p>'}</section>`).join('')}`;
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
