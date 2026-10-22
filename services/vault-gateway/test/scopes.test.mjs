import test from 'node:test';
import assert from 'node:assert/strict';
import { validKeyName, newBotToken, parseBotToken, sha256, safeEqualHex, tokenAllows, newRecoveryCodes, hashRecovery, checkRecovery, stepUpFresh } from '../src/scopes.js';

test('key names follow the codex registry style', () => {
  assert.ok(validKeyName('STRIPE_SECRET_KEY'));
  for (const bad of ['stripe', '../x', 'A', 'A-B', '', null]) assert.equal(validKeyName(bad), false);
});
test('bot token round trip and hash check', () => {
  const t = newBotToken(); const p = parseBotToken(`Bearer ${t.token}`);
  assert.equal(p.id, t.id); assert.ok(safeEqualHex(sha256(p.secret), t.hash));
  assert.equal(parseBotToken('Bearer nope'), null);
});
test('token scopes, expiry and revocation', () => {
  const row = { scopes: ['CLOUDINARY_API_KEY'], expires_at: new Date(Date.now() + 1e6).toISOString() };
  assert.ok(tokenAllows(row, 'CLOUDINARY_API_KEY'));
  assert.equal(tokenAllows(row, 'STRIPE_SECRET_KEY'), false);
  assert.equal(tokenAllows({ ...row, revoked_at: 'x' }, 'CLOUDINARY_API_KEY'), false);
  assert.equal(tokenAllows({ ...row, expires_at: '2000-01-01T00:00:00Z' }, 'CLOUDINARY_API_KEY'), false);
});
test('recovery codes hash and verify', () => {
  const [c] = newRecoveryCodes(1); const h = hashRecovery(c);
  assert.ok(checkRecovery(c, h)); assert.equal(checkRecovery('00000-00000', h), false);
});
test('step-up window is 2 minutes', () => {
  const now = Date.now();
  assert.ok(stepUpFresh({ stepUpAt: now - 60_000 }, now));
  assert.equal(stepUpFresh({ stepUpAt: now - 180_000 }, now), false);
  assert.equal(stepUpFresh(null, now), false);
});
