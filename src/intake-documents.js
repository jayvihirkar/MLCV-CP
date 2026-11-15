import { attachmentList } from './attachments.js';
import { attachmentBody } from './upload-client.js';
import './intake-documents.css';

let intakeId = null, busy = false;
const dialog = document.querySelector('#intakeDocuments');
const input = document.querySelector('#intakeDocumentFiles');
const status = document.querySelector('#intakeDocumentStatus');
const list = document.querySelector('#intakeDocumentList');
const selected = document.querySelector('#intakeDocumentSelection');
const submit = document.querySelector('#saveIntakeDocuments');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let chosen = [];
async function request(path, method = 'GET', body) {
  const token = sessionStorage.getItem('meditrace.token') || localStorage.getItem('meditrace.token') || '';
  const multipart = body instanceof FormData;
  const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(multipart ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Could not save your documents.');
  return payload;
}
function draw(documents) {
  list.innerHTML = documents.length ? attachmentList(documents) + documents.map(item => `<button type="button" class="document-remove" data-remove-intake-document="${escape(item.id)}">Remove ${escape(item.name)}</button>`).join('') : '<p class="documents-empty">No documents added yet. You can continue without uploading anything.</p>';
  document.querySelectorAll('[data-document-count]').forEach(node => { node.textContent = documents.length ? `${documents.length} document${documents.length === 1 ? '' : 's'} saved` : 'Optional'; });
}
function select(files) {
  chosen = [...files];
  selected.innerHTML = chosen.map(file => `<li>${escape(file.name)} <small>${Math.max(1, Math.ceil(file.size / 1024))} KB</small></li>`).join('');
  submit.disabled = busy || !chosen.length;
}
export async function openIntakeDocuments(id) {
  if (!id) return;
  intakeId = id;
  if (!dialog.open) dialog.showModal();
  status.textContent = 'Loading your documents…';
  select([]); input.value = '';
  try { draw((await request(`/api/sessions/${encodeURIComponent(id)}/documents`)).documents); status.textContent = ''; }
  catch (error) { status.textContent = error.message; }
}
input.addEventListener('change', () => select(input.files));
const drop = document.querySelector('#intakeDocumentDrop');
drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragging'); if (!busy) select(event.dataTransfer.files); });
document.querySelector('#intakeDocumentForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !chosen.length || !intakeId) return;
  busy = true; submit.disabled = true; input.disabled = true;
  status.textContent = 'Uploading your documents…';
  try {
    const body = await attachmentBody(chosen, {}, request, message => { status.textContent = message; });
    const payload = await request(`/api/sessions/${encodeURIComponent(intakeId)}/documents`, 'POST', body);
    draw(payload.documents); select([]); input.value = '';
    status.textContent = 'Documents saved. Extraction starts automatically; progress and findings appear below.';
  } catch (error) { status.textContent = error.message; }
  finally { busy = false; input.disabled = false; submit.disabled = !chosen.length; }
});
list.addEventListener('click', async event => {
  const button = event.target.closest('[data-remove-intake-document]');
  if (!button || busy || !window.confirm('Remove this document from the intake?')) return;
  busy = true; button.disabled = true;
  try { draw((await request(`/api/sessions/${encodeURIComponent(intakeId)}/documents/${encodeURIComponent(button.dataset.removeIntakeDocument)}`, 'DELETE')).documents); status.textContent = 'Document removed.'; }
  catch (error) { status.textContent = error.message; }
  finally { busy = false; button.disabled = false; }
});
function close() { if (busy) { status.textContent = 'Please wait until the upload finishes.'; return; } dialog.close(); }
document.querySelector('#closeIntakeDocuments').addEventListener('click', close);
dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
