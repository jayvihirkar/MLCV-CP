// Shared local multipart / Supabase direct-upload path for both upload entry points.
export async function attachmentBody(files, fields, request, onProgress = () => {}) {
  if (files.length > 10 || files.some(file => file.size > 10 * 1024 * 1024)) throw new Error('Choose up to 10 files, each 10 MB or smaller.');
  if (files.length) {
    const plan = await request('/api/profile/attachment-uploads', 'POST', { files: files.map(file => ({ name: file.name, size: file.size })) });
    if (plan.direct) {
      const attachmentIds = [];
      for (let index = 0; index < files.length; index++) {
        onProgress(`Uploading ${index + 1} of ${files.length}: ${files[index].name}`);
        const target = plan.uploads[index];
        const response = await fetch(target.url, { method: 'PUT', headers: { 'Content-Type': target.mimeType }, body: files[index] });
        if (!response.ok) throw new Error('Could not upload this document. Select the files and try again.');
        attachmentIds.push(target.id);
      }
      return { ...fields, attachmentIds };
    }
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  for (const file of files) form.append('attachments', file);
  return form;
}
