import test from 'node:test';
import assert from 'node:assert/strict';
import { api, setAccessToken, clearAccessToken, onAuthenticationFailure } from './api';

test('beta API requires an explicit memory token and sends it only in the header', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.equal(url, '/api/vault/keys');
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer fictional-beta-access-token');
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.cache, 'no-store');
    assert.equal(options?.referrerPolicy, 'no-referrer');
    return Response.json({ keys: [] });
  };
  try {
    clearAccessToken();
    await assert.rejects(api.getKeys(), /Connect to the beta vault first/);
    assert.equal(requests, 0);
    setAccessToken('fictional-beta-access-token');
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
    setAccessToken('fictional-beta-access-token');
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
    setAccessToken('fictional-beta-access-token');
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
    setAccessToken('fictional-beta-access-token');
    await assert.rejects(api.executePrompt({ inputText: 'fictional sample' }), error => error instanceof Error && /disabled or forbidden/.test(error.message) && !error.message.includes('fictional-provider-secret'));
    assert.equal(notified, false);
    globalThis.fetch = async () => Response.json({ keys: [] });
    assert.deepEqual(await api.getKeys(), { keys: [] });
  } finally { unsubscribe(); globalThis.fetch = originalFetch; clearAccessToken(); }
});
