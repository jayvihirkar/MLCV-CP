import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/auth.js', import.meta.url), 'utf8');
const providerCode = source.slice(source.indexOf('let providerCheckRunning'), source.indexOf('async function signOut'));
function loginScreen(fetch) {
  const button = { disabled: true, setAttribute(name, value) { this[name] = value; } };
  const note = { hidden: false };
  const focus = {};
  const context = vm.createContext({
    fetch, AbortSignal, setTimeout: callback => { callback(); },
    googleButton: button, googleNote: note, loginLocale: 'en',
    loginStrings: { en: { googleUnavailable: 'Google is not configured' } },
    window: { addEventListener(name, callback) { focus[name] = callback; } },
    document: { hidden: false, addEventListener() {} },
  });
  vm.runInContext(`let googleEnabled = false; ${providerCode}`, context);
  return { check: () => vm.runInContext('configureProviders()', context), button, note, focus };
}

test('Google login recovers when the API starts after the login page', async () => {
  let calls = 0;
  const screen = loginScreen(async () => {
    if (++calls === 1) return new Response('Starting API', { status: 503 });
    return Response.json({ google: true });
  });
  await screen.check();
  assert.equal(calls, 2);
  assert.equal(screen.button.disabled, false);
  assert.equal(screen.note.hidden, true);
});

test('an offline API shows a connection error and returning to the tab retries Google availability', async () => {
  let online = false;
  const screen = loginScreen(async () => {
    if (!online) throw new Error('Connection refused');
    return Response.json({ google: true });
  });
  await screen.check();
  assert.equal(screen.button.disabled, true);
  assert.match(screen.note.textContent, /Cannot reach/);
  assert.doesNotMatch(screen.note.textContent, /not configured/);
  online = true;
  screen.focus.focus();
  // Allow the fetch and JSON promises in the focus handler to complete.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(screen.button.disabled, false);
  assert.equal(screen.note.hidden, true);
});

test('an explicitly unconfigured provider stays disabled without unnecessary retries', async () => {
  let calls = 0;
  const screen = loginScreen(async () => { calls++; return Response.json({ google: false }); });
  await screen.check();
  assert.equal(calls, 1);
  assert.equal(screen.button.disabled, true);
  assert.equal(screen.note.textContent, 'Google is not configured');
});
