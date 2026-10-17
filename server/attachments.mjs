import multer from 'multer';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

const types = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.heif': 'image/heif' };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 10, fields: 12, fieldSize: 10000 }, fileFilter(_req, file, done) {
  if (!types[extname(file.originalname).toLowerCase()]) return done(new Error('Choose JPG, PNG, WebP, GIF, HEIC/HEIF, PDF, or DOCX files.'));
  done(null, true);
} }).array('attachments', 10);
export function receiveAttachments(req, res, next) {
  upload(req, res, error => error ? res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Each attachment must be 10 MB or smaller.' : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE' ? 'Choose up to 10 attachments at a time.' : error.message }) : next());
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
  await mkdir(directory, { recursive: true });
  const stored = [];
  try {
    for (const file of files) {
      const item = { id: randomUUID(), name: file.originalname.split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200), mimeType: types[extname(file.originalname).toLowerCase()], size: file.size, uploadedAt: new Date().toISOString() };
      await writeFile(join(directory, item.id), file.buffer, { flag: 'wx' });
      stored.push(item);
    }
    return stored;
  } catch (error) { await removeAttachments(stored, directory); throw error; }
}
export async function removeAttachments(items, directory) {
  for (const item of items) {
    try { await unlink(join(directory, item.id)); }
    catch (error) { if (error.code !== 'ENOENT') console.error('Could not remove attachment file:', error.code); }
  }
}
