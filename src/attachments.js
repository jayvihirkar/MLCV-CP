import './attachments.css';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function attachmentList(items = [], historyId = null) {
  return items.length ? `<ul class="attachment-list">${items.map(item => `<li><span class="attachment-name">${escape(item.name)}<small>${Math.max(1, Math.ceil(item.size / 1024))} KB · Patient-uploaded</small></span><button type="button" class="attachment-button" data-download-attachment="${escape(item.id)}" data-attachment-name="${escape(item.name)}">Download</button>${historyId ? `<button type="button" class="attachment-button attachment-remove" data-remove-attachment="${escape(item.id)}" data-history-id="${escape(historyId)}">Remove</button>` : ''}</li>`).join('')}</ul>` : '';
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-download-attachment]');
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    const token = sessionStorage.getItem('meditrace.token') || localStorage.getItem('meditrace.token') || '';
    const response = await fetch(`/api/profile/attachments/${encodeURIComponent(button.dataset.downloadAttachment)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Could not download this attachment.');
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = button.dataset.attachmentName || 'attachment';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { window.alert(error.message); }
  finally { button.disabled = false; }
});
