import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsGate, isEmailAllowed, getAllowedEmails, safeRedirectPath, denialResponse, checkRequest, isClerkConfigured } from '../lib/clerk-gate.js';
import { config } from '../middleware.js';

test('operator pages are gated; public surfaces are not', () => {
  for (const p of ['/', '/index.html', '/apistore', '/apikeys', '/csv-manager', '/linear', '/newsletter', '/briefing', '/video/studio', '/api/whoami']) {
    assert.equal(needsGate('satcom.conews.press', p), true, p);
  }
  for (const p of ['/mcp', '/api/mcp', '/api/health', '/codex', '/kanban', '/api/development-board', '/api/videos', '/video', '/video/upload/abc', '/api/creator-upload', '/api/studio/youtube-callback', '/subscribe-villager/', '/sign-in', '/api/auth-config']) {
    assert.equal(needsGate('satcom.conews.press', p), false, p);
  }
});

test('subscribe.thevillager.today is never gated (LOCK-003)', () => {
  assert.equal(needsGate('subscribe.thevillager.today', '/'), false);
});

test('middleware matcher covers every gated path', () => {
  for (const p of ['/', '/apistore', '/video/studio', '/api/whoami']) assert.ok(config.matcher.includes(p), p);
});

test('allowlist: verified match only, case-insensitive, empty denies', () => {
  const list = getAllowedEmails({ ALLOWED_EMAILS: 'patrick@villagerpublishing.com, idigitalpro@gmail.com' });
  assert.equal(isEmailAllowed(['Patrick@VillagerPublishing.com'], list), true);
  assert.equal(isEmailAllowed(['x@example.com'], list), false);
  assert.equal(isEmailAllowed(['patrick@villagerpublishing.com'], new Set()), false);
});

test('redirects after sign-in stay on this site', () => {
  assert.equal(safeRedirectPath('/kanban?x=1'), '/kanban?x=1');
  assert.equal(safeRedirectPath('https://evil.example'), '/');
  assert.equal(safeRedirectPath('//evil.example'), '/');
});

test('fails closed without Clerk keys: pages 503, APIs 503', async () => {
  assert.equal(isClerkConfigured({}), false);
  const r = await checkRequest(new Request('https://satcom.conews.press/'), {});
  assert.equal(r.kind, 'unconfigured');
  assert.equal(denialResponse(r, new Request('https://satcom.conews.press/')).status, 503);
  assert.equal(denialResponse(r, new Request('https://satcom.conews.press/api/whoami')).status, 503);
});

test('signed out: page redirects to /sign-in, API gets 401', () => {
  const page = denialResponse({ kind: 'signed-out' }, new Request('https://satcom.conews.press/apistore'));
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/sign-in?redirect_url=%2Fapistore');
  assert.equal(denialResponse({ kind: 'signed-out' }, new Request('https://satcom.conews.press/api/whoami')).status, 401);
  assert.equal(denialResponse({ kind: 'forbidden' }, new Request('https://satcom.conews.press/api/whoami')).status, 403);
  assert.equal(denialResponse({ kind: 'ok' }, new Request('https://satcom.conews.press/')), null);
});
