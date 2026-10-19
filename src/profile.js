import './profile.css';
import { attachmentList } from './attachments.js';
import { clarificationLauncher } from './clarifications.js';

const $ = selector => document.querySelector(selector);
const dialog = $('#patientProfile');
const menu = $('#patientMenu');
const profileForm = $('#profileForm');
const historyForm = $('#historyForm');
let profile = null;
let editingId = null;
let detailsDirty = false;
let historyDirty = false;
let busy = false;
const replyDrafts = new Map();
let notificationRevision = '';
let activeConversationId = '';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function status(message, error = false) {
  $('#profileStatus').textContent = message;
  $('#profileStatus').className = error ? 'profile-error' : '';
}
async function request(path, method = 'GET', body) {
  const token = sessionStorage.getItem('meditrace.token') || localStorage.getItem('meditrace.token') || '';
  const multipart = body instanceof FormData;
  const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(multipart ? {} : { 'Content-Type': 'application/json' }) }, body: body ? multipart ? body : JSON.stringify(body) : undefined });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Could not save your profile.');
  return payload;
}
function resetHistoryForm() {
  historyForm.reset();
  $('#selectedHistoryFiles').textContent = '';
  editingId = null;
  historyDirty = false;
  $('#historyFormHeading').textContent = 'Add past history';
  $('#saveHistory').textContent = 'Add to timeline';
  $('#cancelHistory').hidden = true;
}
function drawTimeline() {
  $('#profileTimeline').innerHTML = profile.timeline.length ? profile.timeline.map(item => `<article class="profile-event"><div class="profile-event-meta"><time>${escape(item.date || 'Date not provided')}</time><span>${item.source === 'patient' ? 'Patient-reported' : item.source === 'clarification' ? 'Doctor clarification' : 'Intake conversation'} · ${escape(item.kind)}</span></div><div class="timeline-item-heading"><h4>${escape(item.title)}</h4>${clarificationLauncher(item.clarifications, { patient: true, drafts: replyDrafts })}</div><p>${escape(item.notes)}</p>${attachmentList(item.attachments, item.source === 'patient' ? item.id : null)}${item.source === 'patient' ? `<div class="profile-event-actions"><button type="button" class="quick-chip" data-edit-history="${escape(item.id)}">Edit / add documents</button><button type="button" class="quick-chip" data-delete-history="${escape(item.id)}">Delete</button></div>` : ''}</article>`).join('') : '<p>No history yet. Add an event above to begin your timeline.</p>';
}
function currentConversation(accountId) {
  try { return JSON.parse(localStorage.getItem(`meditrace.intake.${accountId}`) || 'null')?.id || ''; } catch { return ''; }
}
function drawConversationClarifications(data) {
  activeConversationId = currentConversation(data.account.id);
  const threads = (data.clarifications || []).filter(thread => thread.target.type === 'intake' && thread.target.id === activeConversationId);
  const host = $('#currentConversationClarifications');
  host.hidden = !threads.length;
  host.innerHTML = threads.length ? `<strong>Doctor clarification for this conversation</strong>${clarificationLauncher(threads, { patient: true, drafts: replyDrafts, scope: 'conversation' })}` : '';
}
async function loadProfile(fillDetails = false) {
  profile = await request('/api/profile');
  updateNotification((profile.clarifications || []).filter(thread => thread.status === 'awaiting_patient').length);
  $('#profileAccount').textContent = `${profile.account.name} · ${profile.account.email}`;
  if (fillDetails) {
    profileForm.reset();
    for (const [key, value] of Object.entries(profile.details)) {
      const field = profileForm.elements.namedItem(key);
      if (field) field.value = value;
    }
    detailsDirty = false;
  }
  drawTimeline();
  drawConversationClarifications(profile);
  $('#profileContent').hidden = false;
}
function hideMenu() {
  menu.hidden = true;
  $('#patientOptions').setAttribute('aria-expanded', 'false');
}
async function openProfile() {
  hideMenu();
  if (dialog.open) return;
  dialog.showModal();
  $('#profileContent').hidden = true;
  resetHistoryForm();
  status('Loading your profile…');
  busy = true;
  try { await loadProfile(true); status(''); }
  catch (error) { status(error.message, true); }
  finally { busy = false; }
}
function closeProfile() {
  if (busy) { status('Please wait for the current request to finish.'); return; }
  if ((detailsDirty || historyDirty || replyDrafts.size) && !window.confirm('Close with unsaved changes? Profile and history edits will be discarded; reply drafts will remain until you refresh.')) return;
  dialog.close();
}
$('#patientOptions').addEventListener('click', () => {
  menu.hidden = !menu.hidden;
  $('#patientOptions').setAttribute('aria-expanded', String(!menu.hidden));
});
document.addEventListener('click', event => { if (!event.target.closest('.patient-card')) hideMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideMenu(); });
$('#openProfile').addEventListener('click', openProfile);
$('#mobileProfile').addEventListener('click', openProfile);
$('#closeProfile').addEventListener('click', closeProfile);
dialog.addEventListener('cancel', event => { event.preventDefault(); closeProfile(); });
function updateNotification(pending) {
  $('#patientClarificationAlert').hidden = pending === 0;
  $('#patientClarificationText').textContent = `${pending} doctor clarification${pending === 1 ? '' : 's'} need${pending === 1 ? 's' : ''} your answer.`;
}
async function pollClarifications() {
  if (document.hidden || document.body.classList.contains('is-doctor')) return;
  const token = sessionStorage.getItem('meditrace.token') || localStorage.getItem('meditrace.token');
  if (!token) return;
  try {
    const data = await request('/api/profile/notifications');
    updateNotification(data.pending);
    const changed = data.revision !== notificationRevision || currentConversation(data.accountId) !== activeConversationId;
    let consumed = !changed;
    if (dialog.open && !busy && changed) { await loadProfile(); consumed = true; }
    else if (!dialog.open && changed) { drawConversationClarifications(await request('/api/profile')); consumed = true; }
    if (consumed) notificationRevision = data.revision;
  } catch { /* Keep existing information if temporarily offline. */ }
}
$('#viewPatientClarifications').addEventListener('click', async () => {
  await openProfile();
  const chat = $('#profileTimeline').querySelector('[data-toggle-clarification][data-attention="true"]');
  if (chat) { if (chat.getAttribute('aria-expanded') !== 'true') chat.click(); chat.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  else $('#profileTimeline').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
function trackClarificationDraft(event) {
  const form = event.target.closest('[data-clarification-reply]');
  if (!form) return;
  if (event.target.value.trim()) replyDrafts.set(form.dataset.clarificationReply, event.target.value);
  else replyDrafts.delete(form.dataset.clarificationReply);
}
async function sendClarificationReply(event) {
  const form = event.target.closest('[data-clarification-reply]');
  if (!form) return;
  event.preventDefault();
  if (busy) return;
  busy = true;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await request(`/api/profile/clarifications/${form.dataset.clarificationReply}/reply`, 'POST', { answer: new FormData(form).get('answer') });
    replyDrafts.delete(form.dataset.clarificationReply);
    await loadProfile();
    status('Answer sent to your doctor. Your full clarification history is saved.');
  } catch (error) { status(error.message, true); }
  finally { busy = false; button.disabled = false; }
}
for (const host of [$('#profileTimeline'), $('#currentConversationClarifications')]) {
  host.addEventListener('input', trackClarificationDraft);
  host.addEventListener('submit', sendClarificationReply);
}
setInterval(pollClarifications, 15000);
document.addEventListener('visibilitychange', pollClarifications);
window.addEventListener('intake-session-changed', () => {
  $('#currentConversationClarifications').hidden = true;
  pollClarifications();
});
pollClarifications();
profileForm.addEventListener('input', () => { detailsDirty = true; });
historyForm.addEventListener('input', () => { historyDirty = true; });
$('#historyAttachments').addEventListener('change', () => {
  historyDirty = true;
  $('#selectedHistoryFiles').textContent = Array.from($('#historyAttachments').files).map(file => `${file.name} (${Math.max(1, Math.ceil(file.size / 1024))} KB)`).join('\n');
});
profileForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  const button = profileForm.querySelector('[type="submit"]');
  button.disabled = true;
  status('Saving profile…');
  try {
    await request('/api/profile', 'PUT', Object.fromEntries(new FormData(profileForm)));
    detailsDirty = false;
    status('Profile saved for all your conversations.');
  } catch (error) { status(error.message, true); }
  finally { busy = false; button.disabled = false; }
});
historyForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const files = Array.from($('#historyAttachments').files);
  if (files.length > 10 || files.some(file => file.size > 10 * 1024 * 1024)) { status('Choose up to 10 files, each 10 MB or smaller.', true); return; }
  busy = true;
  $('#saveHistory').disabled = true;
  status('Saving history…');
  try {
    const form = new FormData(historyForm);
    if (!files.length) form.delete('attachments');
    let body = form;
    if (files.length) {
      const plan = await request('/api/profile/attachment-uploads', 'POST', { files: files.map(file => ({ name: file.name, size: file.size })) });
      if (plan.direct) {
        const attachmentIds = [];
        for (let index = 0; index < files.length; index++) {
          const target = plan.uploads[index];
          const response = await fetch(target.url, { method: 'PUT', headers: { 'Content-Type': target.mimeType }, body: files[index] });
          if (!response.ok) throw new Error('Could not upload this document. Select the files and try again.');
          attachmentIds.push(target.id);
        }
        form.delete('attachments');
        body = { ...Object.fromEntries(form), attachmentIds };
      }
    }
    await request(editingId ? `/api/profile/history/${editingId}` : '/api/profile/history', editingId ? 'PUT' : 'POST', body);
    resetHistoryForm();
    await loadProfile();
    status('History saved to your account timeline.');
  } catch (error) { status(error.message, true); }
  finally { busy = false; $('#saveHistory').disabled = false; }
});
$('#cancelHistory').addEventListener('click', () => {
  if (!busy && (!historyDirty || window.confirm('Discard this unsaved history entry?'))) resetHistoryForm();
});
$('#profileTimeline').addEventListener('click', async event => {
  if (busy) return;
  const edit = event.target.closest('[data-edit-history]');
  const remove = event.target.closest('[data-delete-history]');
  const removeFile = event.target.closest('[data-remove-attachment]');
  if (removeFile) {
    if (!window.confirm('Permanently remove this supporting document from the history entry?')) return;
    busy = true;
    removeFile.disabled = true;
    try {
      await request(`/api/profile/history/${removeFile.dataset.historyId}/attachments/${removeFile.dataset.removeAttachment}`, 'DELETE');
      await loadProfile();
      status('Attachment removed.');
    } catch (error) { status(error.message, true); }
    finally { busy = false; removeFile.disabled = false; }
    return;
  }
  if (edit) {
    if (historyDirty && !window.confirm('Discard the history entry you are currently editing?')) return;
    const item = profile.history.find(item => item.id === edit.dataset.editHistory);
    if (!item) return;
    editingId = item.id;
    $('#historyAttachments').value = '';
    $('#selectedHistoryFiles').textContent = '';
    for (const key of ['title', 'date', 'kind', 'notes']) historyForm.elements.namedItem(key).value = item[key] || '';
    historyDirty = false;
    $('#historyFormHeading').textContent = 'Edit history entry';
    $('#saveHistory').textContent = 'Save history changes';
    $('#cancelHistory').hidden = false;
    historyForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    historyForm.elements.namedItem('title').focus();
  } else if (remove && window.confirm('Permanently delete this history entry from your account timeline?')) {
    busy = true;
    remove.disabled = true;
    try {
      await request(`/api/profile/history/${remove.dataset.deleteHistory}`, 'DELETE');
      if (editingId === remove.dataset.deleteHistory) resetHistoryForm();
      await loadProfile();
      status('History entry deleted.');
    } catch (error) { status(error.message, true); }
    finally { busy = false; remove.disabled = false; }
  }
});
