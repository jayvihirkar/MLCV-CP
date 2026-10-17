import './clarifications.css';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const clarificationStatus = thread => ({ awaiting_patient: 'Waiting for patient', awaiting_doctor: 'Answered · awaiting doctor review', approved: 'Approved' }[thread.status] || thread.status);
export function clarificationHistory(thread, { patient = false, draft = '' } = {}) {
  return `<section class="clarification-thread" data-clarification-thread="${escape(thread.id)}"><div class="clarification-thread-heading"><strong>${escape(thread.target.label)}</strong><span class="clarification-state">${escape(clarificationStatus(thread))}</span></div><ol class="clarification-messages">${thread.messages.map(message => `<li class="clarification-message ${message.role === 'patient' ? 'patient-answer' : 'doctor-question'}"><small>${escape(message.author)} · ${message.kind === 'approval' ? 'Approval' : message.role === 'patient' ? 'Patient answer' : 'Doctor question'} · ${escape(new Date(message.at).toLocaleString())}</small><p>${escape(message.text)}</p></li>`).join('')}</ol>${patient && thread.status === 'awaiting_patient' ? `<form data-clarification-reply="${escape(thread.id)}"><label>Your answer<textarea name="answer" required maxlength="2000" rows="3" placeholder="Reply to the doctor's latest question…">${escape(draft)}</textarea></label><button type="submit" class="attachment-button">Send answer</button></form>` : ''}</section>`;
}
const openChats = new Set();
export function clarificationLauncher(threads = [], { patient = false, drafts = new Map(), scope = patient ? 'timeline' : 'doctor' } = {}) {
  if (!threads.length) return '';
  const key = `${scope}-${threads[0].id}`;
  const id = `clarification-chat-${key}`;
  const attention = threads.some(thread => thread.status === (patient ? 'awaiting_patient' : 'awaiting_doctor'));
  return `<div class="clarification-launcher"><button type="button" class="clarification-chat-icon${attention ? ' needs-answer' : ''}" data-toggle-clarification="${escape(key)}" data-attention="${attention}" aria-label="Open clarification chat: ${threads.length} thread${threads.length === 1 ? '' : 's'}${attention ? ', awaiting your response' : ''}" title="Clarification chat" aria-expanded="${openChats.has(key)}" aria-controls="${escape(id)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg><span>${threads.length}</span></button><section id="${escape(id)}" class="clarification-chat-panel" ${openChats.has(key) ? '' : 'hidden'}>${threads.map(thread => clarificationHistory(thread, { patient, draft: drafts.get(thread.id) || '' }) + (!patient ? `<div class="clarification-thread-actions"><button type="button" class="attachment-button" data-act="clarify-followup" data-thread-id="${escape(thread.id)}" ${thread.status === 'awaiting_patient' ? 'disabled' : ''}>Ask follow-up</button>${thread.status !== 'approved' ? `<button type="button" class="attachment-button" data-act="approve-clarification" data-thread-id="${escape(thread.id)}" ${thread.status === 'awaiting_patient' ? 'disabled' : ''}>Approve clarification</button>` : ''}</div>` : '')).join('')}</section></div>`;
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-toggle-clarification]');
  if (!button) return;
  const panel = button.closest('.clarification-launcher').querySelector('.clarification-chat-panel');
  panel.hidden = !panel.hidden;
  button.setAttribute('aria-expanded', String(!panel.hidden));
  if (panel.hidden) openChats.delete(button.dataset.toggleClarification); else openChats.add(button.dataset.toggleClarification);
});
