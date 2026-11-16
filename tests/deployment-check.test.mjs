import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDeployment } from '../scripts/check-deployment.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const config = () => ({
  SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'never-print-service-key',
  GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'never-print-google-secret',
  GOOGLE_REDIRECT_URI: 'https://demo.vercel.app/api/auth/google/callback',
  DOCUMENT_PIPELINE_URL: 'https://worker.example.com', DOCUMENT_PIPELINE_TOKEN: 'never-print-worker-token',
  GEMINI_API_KEY: 'never-print-gemini-key', INTAKE_LLM_PROVIDER: 'gemini', SEED_DEMO_USERS: 'true',
});

test('deployment check rejects laptop addresses and a callback for another domain without sending credentials', async () => {
  for (const worker of ['http://127.0.0.1:8000', 'https://192.168.1.4', 'https://localhost', 'https://[::1]', 'https://user:secret@worker.example.com']) {
    let called = false;
    const result = await checkDeployment({ ...config(), DOCUMENT_PIPELINE_URL: worker }, {
      origin: 'https://other.vercel.app', live: true, request: async () => { called = true; },
    });
    assert.equal(called, false);
    assert.ok(result.errors.some(message => message.includes('DOCUMENT_PIPELINE_URL')));
    assert.ok(result.errors.some(message => message.includes('same origin')));
    assert.doesNotMatch(JSON.stringify(result), /never-print|user:secret/);
  }
  const missing = await checkDeployment({});
  assert.ok(missing.errors.some(message => message.includes('SUPABASE_SERVICE_ROLE_KEY')));
});

test('deployment live checks use read-only requests, route credentials correctly, and reject a public bucket', async () => {
  const requests = [];
  let publicBucket = false;
  const request = async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.method || 'GET', 'GET');
    assert.equal(options.redirect, 'error');
    let body;
    if (url.includes('/rest/v1/app_records')) body = [];
    else if (url.endsWith('/rest/v1/')) body = { paths: { '/rpc/app_apply_changes': {}, '/rpc/app_take_record': {} } };
    else if (url.includes('/storage/')) body = { public: publicBucket, file_size_limit: 10485760 };
    else if (url.startsWith('https://worker.')) {
      assert.equal(options.headers.Authorization, 'Bearer never-print-worker-token'); body = { ok: true };
    } else {
      assert.equal(options.headers, undefined);
      body = { ok: true, persistence: 'supabase', googleConfigured: true, geminiConfigured: true, documentPipelineConfigured: true };
    }
    if (url.startsWith('https://demo.supabase.co')) assert.equal(options.headers.apikey, 'never-print-service-key');
    return Response.json(body);
  };
  const result = await checkDeployment(config(), { origin: 'https://demo.vercel.app', live: true, request });
  assert.deepEqual(result.errors, []);
  assert.equal(result.checks.length, 5);
  assert.equal(requests.length, 5);
  publicBucket = true;
  const invalid = await checkDeployment(config(), { live: true, request });
  assert.ok(invalid.errors.some(message => message.startsWith('Private attachment bucket failed')));
});

test('deployment check sanitizes failed upstream responses and redirects', async () => {
  const result = await checkDeployment(config(), { live: true, request: async () => { throw new Error('never-print-service-key'); } });
  assert.equal(result.errors.length, 4);
  assert.doesNotMatch(JSON.stringify(result), /never-print/);
});

test('deployment CLI accepts the positional domain used by PowerShell npm and exits nonzero for missing setup', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/check-deployment.mjs', import.meta.url)), 'https://demo.vercel.app'], {
    env: { ...process.env, ...config(), SUPABASE_SERVICE_ROLE_KEY: '' }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Set SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(result.stderr + result.stdout, /Usage:|never-print/);
});
