import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// Read-only checks. Never print credentials, upstream response bodies, or URLs.
export async function checkDeployment(env, { origin, live = false, request = fetch } = {}) {
  const errors = [], warnings = [], checks = [];
  const value = name => String(env[name] || '').trim();
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'DOCUMENT_PIPELINE_URL',
    'DOCUMENT_PIPELINE_TOKEN', 'GEMINI_API_KEY'];
  for (const name of required) {
    if (!value(name) || /YOUR_|REPLACE_ME|<[^>]+>/i.test(value(name))) errors.push(`Set ${name}.`);
  }
  function publicUrl(name, input, originOnly = false) {
    if (!input) return null;
    try {
      const url = new URL(input);
      const host = url.hostname.toLowerCase();
      const local = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[::|\[f[cd])/i.test(host)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /\.(local|localhost)$/.test(host);
      if (url.protocol !== 'https:' || local || !host.includes('.') || url.username || url.password
        || url.search || url.hash || (originOnly && url.pathname !== '/')) throw new Error();
      return url;
    } catch { errors.push(`${name} must be a public HTTPS ${originOnly ? 'origin' : 'URL'} without credentials, query parameters, or fragments.`); return null; }
  }
  const supabase = publicUrl('SUPABASE_URL', value('SUPABASE_URL'), true);
  const worker = publicUrl('DOCUMENT_PIPELINE_URL', value('DOCUMENT_PIPELINE_URL'));
  const callback = publicUrl('GOOGLE_REDIRECT_URI', value('GOOGLE_REDIRECT_URI'));
  const site = origin ? publicUrl('--origin', origin, true) : null;
  if (callback && callback.pathname !== '/api/auth/google/callback') errors.push('GOOGLE_REDIRECT_URI must end with /api/auth/google/callback.');
  if (site && callback && site.origin !== callback.origin) errors.push('GOOGLE_REDIRECT_URI must use the same origin as the deployed site.');
  if (value('INTAKE_LLM_PROVIDER') && value('INTAKE_LLM_PROVIDER') !== 'gemini') errors.push('Use INTAKE_LLM_PROVIDER=gemini for this Google/Gemini demo.');
  if (!value('ELEVENLABS_API_KEY')) warnings.push('ElevenLabs is unset; narration will use the browser voice where available.');
  if (value('SHOW_DEMO_PATIENTS') === 'true') warnings.push('The doctor queue will include fictional seeded patient records.');
  if (value('SEED_DEMO_USERS') !== 'true') warnings.push('Demo doctor accounts are not seeded automatically; provision or migrate a clinician account.');
  if (!origin) warnings.push('Pass --origin https://YOUR-DOMAIN to check the exact Google callback domain.');
  if (!live) warnings.push('Configuration check only. Add --live to check database, private bucket, worker, and deployed API access.');
  if (live && !errors.length) {
    const headers = { apikey: value('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${value('SUPABASE_SERVICE_ROLE_KEY')}` };
    async function probe(label, url, options, valid = () => true) {
      try {
        const response = await request(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (!valid(body)) throw new Error();
        checks.push(label);
      } catch { errors.push(`${label} failed. Check credentials, schema, service availability, and network access.`); }
    }
    const base = supabase.origin;
    const bucket = encodeURIComponent(value('SUPABASE_STORAGE_BUCKET') || 'meditrace-attachments');
    await Promise.all([
      probe('Supabase app_records read', `${base}/rest/v1/app_records?select=key&limit=1`, { headers }, Array.isArray),
      probe('Supabase RPC schema', `${base}/rest/v1/`, { headers }, body => Boolean(body.paths?.['/rpc/app_apply_changes'] && body.paths?.['/rpc/app_take_record'])),
      probe('Private attachment bucket', `${base}/storage/v1/bucket/${bucket}`, { headers }, body => body.public === false && Number(body.file_size_limit) >= 10485760),
      probe('Authenticated document worker', `${worker.href.replace(/\/$/, '')}/health`, { headers: { Authorization: `Bearer ${value('DOCUMENT_PIPELINE_TOKEN')}` } }, body => body.ok === true),
      ...(site ? [probe('Deployed application configuration', `${site.origin}/api/health`, {}, body => body.ok === true && body.persistence === 'supabase' && body.googleConfigured === true && body.documentPipelineConfigured === true && body.geminiConfigured === true)] : []),
    ]);
    warnings.push('Worker health does not confirm model readiness or OCR accuracy. Complete a browser upload and voice intake rehearsal.');
  }
  return { errors, warnings, checks };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  let parsed;
  try {
    parsed = parseArgs({ options: { origin: { type: 'string' }, live: { type: 'boolean' } }, allowPositionals: true });
    if (parsed.positionals.length > 1 || (parsed.values.origin && parsed.positionals.length)) throw new Error();
  } catch {
    console.error('Usage: node scripts/check-deployment.mjs [--origin https://YOUR-DOMAIN] [--live]');
    process.exitCode = 1;
  }
  if (parsed && !process.exitCode) {
    const result = await checkDeployment(process.env, { origin: parsed.values.origin || parsed.positionals[0], live: parsed.values.live });
    for (const message of result.checks) console.log(`PASS: ${message}`);
    for (const message of result.warnings) console.log(`NOTE: ${message}`);
    for (const message of result.errors) console.error(`FAIL: ${message}`);
    console.log(result.errors.length ? 'Deployment checks failed.' : 'Deployment checks passed.');
    process.exitCode = result.errors.length ? 1 : 0;
  }
}
