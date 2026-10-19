import './environment.mjs';

export function supabaseConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fail = message => { const error = new Error(message); error.status = 503; throw error; };
  if (Boolean(url) !== Boolean(key)) fail('Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  if (process.env.VERCEL && !url) fail('Supabase credentials are required on Vercel; local files are not durable there.');
  return Boolean(url && key);
}

export async function supabaseRequest(path, { method = 'GET', body, headers = {}, binary = false } = {}) {
  if (!supabaseConfigured()) throw new Error('Supabase is not configured.');
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}${path}`, {
    method,
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const error = new Error(detail.code === '40001' ? 'This record changed in another session. Refresh and try again.' : 'Cloud storage could not complete the request. Check the Supabase setup and try again.');
    error.status = detail.code === '40001' ? 409 : 503;
    error.code = detail.code;
    error.upstreamStatus = Number(detail.statusCode) || response.status;
    throw error;
  }
  if (binary) return Buffer.from(await response.arrayBuffer());
  if (response.status === 204 || response.headers.get('content-length') === '0') return null;
  return response.json().catch(() => null);
}

export const storageBucket = () => process.env.SUPABASE_STORAGE_BUCKET || 'meditrace-attachments';
const objectPath = key => `${encodeURIComponent(storageBucket())}/${key.split('/').map(encodeURIComponent).join('/')}`;
export const uploadObject = (key, buffer, mimeType) => supabaseRequest(`/storage/v1/object/${objectPath(key)}`, { method: 'POST', body: buffer, headers: { 'Content-Type': mimeType, 'x-upsert': 'false' } });
export const downloadObject = key => supabaseRequest(`/storage/v1/object/authenticated/${objectPath(key)}`, { binary: true });
export const deleteObject = key => supabaseRequest(`/storage/v1/object/${encodeURIComponent(storageBucket())}`, { method: 'DELETE', body: { prefixes: [key] } });
export async function signedDownload(key) {
  const result = await supabaseRequest(`/storage/v1/object/sign/${objectPath(key)}`, { method: 'POST', body: { expiresIn: 60 } });
  return `${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1${result.signedURL}`;
}
export async function signedUpload(key) {
  const result = await supabaseRequest(`/storage/v1/object/upload/sign/${objectPath(key)}`, { method: 'POST', body: {} });
  return `${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1${result.url}`;
}
