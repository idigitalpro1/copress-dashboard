import test from 'node:test';
import assert from 'node:assert/strict';
import { api, setAccessToken, clearAccessToken, onAuthenticationFailure, AUTH_IDLE_TIMEOUT_MS, touchAccessToken } from './api';

test('beta API requires an explicit memory token and sends it only in the header', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.equal(url, '/api/vault/keys');
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer fictional-beta-access-token-for-tests');
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.cache, 'no-store');
    assert.equal(options?.referrerPolicy, 'no-referrer');
    assert.equal(options?.mode, 'same-origin');
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.signal?.aborted, false);
    return Response.json({ keys: [] });
  };
  try {
    clearAccessToken();
    await assert.rejects(api.getKeys(), /Connect to the beta vault first/);
    assert.equal(requests, 0);
    setAccessToken('fictional-beta-access-token-for-tests');
    assert.deepEqual(await api.getKeys(), { keys: [] });
    assert.equal(requests, 1);
    clearAccessToken();
    await assert.rejects(api.getKeys(), /Connect to the beta vault first/);
    assert.equal(requests, 1);
  } finally { globalThis.fetch = originalFetch; clearAccessToken(); }
});

test('rejected authentication clears the token without reflecting a response secret', async () => {
  const originalFetch = globalThis.fetch;
  let notified = false;
  const unsubscribe = onAuthenticationFailure(() => { notified = true; });
  globalThis.fetch = async () => Response.json({ error: 'fictional-secret-that-must-not-be-shown' }, { status: 401 });
  try {
    setAccessToken('fictional-beta-access-token-for-tests');
    await assert.rejects(api.getKeys(), error => error instanceof Error && /access token was rejected/.test(error.message) && !error.message.includes('fictional-secret'));
    assert.equal(notified, true);
    await assert.rejects(api.getKeys(), /Connect to the beta vault first/);
  } finally { unsubscribe(); globalThis.fetch = originalFetch; clearAccessToken(); }
});

test('responses from a disconnected session cannot populate the vault', async () => {
  const originalFetch = globalThis.fetch;
  let finishBody!: (data: unknown) => void;
  let bodyRequested!: () => void;
  const bodyStarted = new Promise<void>(resolve => { bodyRequested = resolve; });
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: () => { bodyRequested(); return new Promise(resolve => { finishBody = resolve; }); },
  }) as Response;
  try {
    setAccessToken('fictional-beta-access-token-for-tests');
    const pending = api.getKeys();
    await bodyStarted;
    clearAccessToken();
    finishBody({ keys: [{ label: 'stale session' }] });
    await assert.rejects(pending, /connection changed/);
  } finally { globalThis.fetch = originalFetch; clearAccessToken(); }
});

test('provider failures stay generic and do not sign out an authenticated session', async () => {
  const originalFetch = globalThis.fetch;
  let notified = false;
  const unsubscribe = onAuthenticationFailure(() => { notified = true; });
  globalThis.fetch = async () => Response.json({ error: 'fictional-provider-secret' }, { status: 403 });
  try {
    setAccessToken('fictional-beta-access-token-for-tests');
    await assert.rejects(api.executePrompt({ inputText: 'fictional sample' }), error => error instanceof Error && /disabled or forbidden/.test(error.message) && !error.message.includes('fictional-provider-secret'));
    assert.equal(notified, false);
    globalThis.fetch = async () => Response.json({ keys: [] });
    assert.deepEqual(await api.getKeys(), { keys: [] });
  } finally { unsubscribe(); globalThis.fetch = originalFetch; clearAccessToken(); }
});


test('disconnect aborts outstanding credential requests instead of only hiding their results', async () => {
  const originalFetch = globalThis.fetch;
  let signal: AbortSignal | null = null;
  let started!: () => void;
  const fetchStarted = new Promise<void>(resolve => { started = resolve; });
  globalThis.fetch = async (_url, options) => {
    signal = options!.signal!;
    started();
    return new Promise((_resolve, reject) => {
      signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  };
  try {
    setAccessToken('fictional-beta-access-token-for-tests');
    const pending = api.validateAndSaveKey({ rawKey: 'fictional-api-key', providerHint: 'custom' });
    await fetchStarted;
    clearAccessToken();
    assert.equal(signal!.aborted, true);
    await assert.rejects(pending, /connection changed/);
  } finally { globalThis.fetch = originalFetch; clearAccessToken(); }
});

test('background requests do not extend idle authentication and expiry requires a new token', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 1000;
  let requests = 0;
  let reason = '';
  Date.now = () => now;
  globalThis.fetch = async () => { requests++; return Response.json({ keys: [] }); };
  const unsubscribe = onAuthenticationFailure(value => { reason = value; });
  try {
    setAccessToken('fictional-beta-access-token-for-tests');
    now += AUTH_IDLE_TIMEOUT_MS - 1;
    await api.getKeys();
    now++;
    await assert.rejects(api.getKeys(), /Connect to the beta vault first/);
    assert.equal(requests, 1);
    assert.equal(reason, 'expired');
    touchAccessToken();
    await assert.rejects(api.getKeys(), /Connect to the beta vault first/);
    assert.equal(requests, 1);
  } finally { unsubscribe(); globalThis.fetch = originalFetch; Date.now = originalNow; clearAccessToken(); }
});

test('explicit user activity extends a live session while malformed token input cannot replace it', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  globalThis.fetch = async (_url, options) => {
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer fictional-beta-access-token-for-tests');
    return Response.json({ keys: [] });
  };
  try {
    setAccessToken('fictional-beta-access-token-for-tests');
    assert.throws(() => setAccessToken('fictional-token with a hidden whitespace character'), /valid beta access token/);
    assert.throws(() => setAccessToken('short'), /at least 32/);
    now += AUTH_IDLE_TIMEOUT_MS - 1;
    touchAccessToken();
    now += AUTH_IDLE_TIMEOUT_MS - 1;
    assert.deepEqual(await api.getKeys(), { keys: [] });
    now++;
    await assert.rejects(api.getKeys(), /Connect to the beta vault first/);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; clearAccessToken(); }
});

test('hung credential requests have a deadline and do not claim a failed save was rolled back', async context => {
  const originalFetch = globalThis.fetch;
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null = null;
  let started!: () => void;
  const fetchStarted = new Promise<void>(resolve => { started = resolve; });
  globalThis.fetch = async (_url, options) => {
    signal = options!.signal!;
    started();
    return new Promise((_resolve, reject) => {
      signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  };
  try {
    setAccessToken('fictional-beta-access-token-for-tests');
    const pending = api.validateAndSaveKey({ rawKey: 'fictional-api-key', providerHint: 'custom' });
    await fetchStarted;
    context.mock.timers.tick(90_000);
    assert.equal(signal!.aborted, true);
    await assert.rejects(pending, /timed out.*check whether changes were saved/);
  } finally { globalThis.fetch = originalFetch; clearAccessToken(); context.mock.timers.reset(); }
});
