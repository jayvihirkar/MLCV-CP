import multer from 'multer';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { supabaseConfigured, uploadObject, downloadObject, deleteObject, signedUpload } from './supabase.mjs';
import { putRecord, takeRecord } from './persistence.mjs';

const types = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.heif': 'image/heif' };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 10, fields: 12, fieldSize: 10000 }, fileFilter(_req, file, done) {
  if (!types[extname(file.originalname).toLowerCase()]) return done(new Error('Choose JPG, PNG, WebP, GIF, HEIC/HEIF, PDF, or DOCX files.'));
  done(null, true);
} }).array('attachments', 10);
export function receiveAttachments(req, res, next) {
  if (req.is('application/json')) return next();
  if (process.env.VERCEL) return res.status(400).json({ error: 'Use direct cloud uploads for attachments.' });
  upload(req, res, error => error ? res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Each attachment must be 10 MB or smaller.' : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE' ? 'Choose up to 10 attachments at a time.' : error.message }) : next());
}

export function registerAttachmentUploads(app, authenticate) {
  app.post('/api/profile/attachment-uploads', authenticate, async (req, res) => {
    if (req.user.role !== 'Patient') return res.status(403).json({ error: 'Uploads are available to patient accounts only.' });
    if (!supabaseConfigured()) return res.json({ direct: false });
    const files = req.body?.files;
    if (!Array.isArray(files) || !files.length || files.length > 10 || files.some(file => typeof file.name !== 'string' || file.name.length > 200 || !types[extname(file.name).toLowerCase()] || !Number.isInteger(file.size) || file.size < 1 || file.size > 10 * 1024 * 1024)) {
      return res.status(400).json({ error: 'Choose up to 10 supported files, each 10 MB or smaller.' });
    }
    const uploads = [];
    for (const file of files) {
      const id = randomUUID();
      const key = `staging/${id}`;
      const mimeType = types[extname(file.name).toLowerCase()];
      const url = await signedUpload(key);
      await putRecord('upload-tickets', id, { userId: req.user.userId, name: file.name, size: file.size, key, expiresAt: Date.now() + 30 * 60 * 1000 });
      uploads.push({ id, url, mimeType });
    }
    res.json({ direct: true, uploads });
  });
}

export async function resolveUploadedAttachments(ids, userId) {
  if (!Array.isArray(ids) || ids.length > 10 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))) {
    const error = new Error('Invalid attachment upload references.'); error.status = 400; throw error;
  }
  const files = [];
  for (const id of ids) {
    const ticket = await takeRecord('upload-tickets', id, userId);
    if (!ticket || ticket.expiresAt < Date.now()) {
      const error = new Error('This upload expired or was already used. Select the files and try again.'); error.status = 400; throw error;
    }
    try {
      const buffer = await downloadObject(ticket.key);
      if (buffer.length !== ticket.size) { const error = new Error('Uploaded file size does not match. Select the files and try again.'); error.status = 400; throw error; }
      files.push({ buffer, size: buffer.length, originalname: ticket.name });
    } finally { await deleteObject(ticket.key); }
  }
  return files;
}
function validContent(buffer, extension) {
  if (extension === '.pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (extension === '.docx') return buffer.subarray(0, 2).toString() === 'PK' && buffer.includes(Buffer.from('[Content_Types].xml')) && buffer.includes(Buffer.from('word/document.xml'));
  if (extension === '.jpg' || extension === '.jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (extension === '.png') return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (extension === '.gif') return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString());
  if (extension === '.webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  return buffer.subarray(4, 8).toString() === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(buffer.subarray(8, 40).toString());
}
export async function storeAttachments(files, directory) {
  for (const file of files) if (!validContent(file.buffer, extname(file.originalname).toLowerCase())) {
    const error = new Error(`The contents of ${file.originalname} do not match a supported file type.`);
    error.status = 400;
    throw error;
  }
  if (!supabaseConfigured()) await mkdir(directory, { recursive: true });
  const stored = [];
  try {
    for (const file of files) {
      const item = { id: randomUUID(), name: file.originalname.split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200), mimeType: types[extname(file.originalname).toLowerCase()], size: file.size, uploadedAt: new Date().toISOString() };
      if (supabaseConfigured()) await uploadObject(item.id, file.buffer, item.mimeType);
      else await writeFile(join(directory, item.id), file.buffer, { flag: 'wx' });
      stored.push(item);
    }
    return stored;
  } catch (error) { await removeAttachments(stored, directory); throw error; }
}
export async function removeAttachments(items, directory) {
  for (const item of items) {
    try {
      if (supabaseConfigured()) await deleteObject(item.id);
      else await unlink(join(directory, item.id));
    }
    catch (error) { if (error.code !== 'ENOENT') console.error('Could not remove attachment file:', error.code); }
  }
}
