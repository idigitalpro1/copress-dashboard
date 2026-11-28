// Pure helpers (unit-tested). No secret values pass through here.
import { createHash, randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';

export const KEY_NAME = /^[A-Z][A-Z0-9_]{1,127}$/; // matches codex docs/registry/api-keys.yaml names

export function validKeyName(name) { return typeof name === 'string' && KEY_NAME.test(name); }

export function newBotToken() {
  const id = randomBytes(6).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  return { id, token: `svt_${id}_${secret}`, hash: sha256(secret) };
}

export function parseBotToken(header) {
  const m = /^Bearer svt_([0-9a-f]{12})_([A-Za-z0-9_-]{43})$/.exec(header || '');
  return m ? { id: m[1], secret: m[2] } : null;
}

export function sha256(s) { return createHash('sha256').update(s).digest('hex'); }

export function safeEqualHex(a, b) {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

// Can token row {scopes:[names], expires_at, revoked_at} read keyName at time now?
export function tokenAllows(row, keyName, now = Date.now()) {
  if (!row || row.revoked_at) return false;
  if (row.expires_at && Date.parse(row.expires_at) <= now) return false;
  return validKeyName(keyName) && Array.isArray(row.scopes) && row.scopes.includes(keyName);
}

export function newRecoveryCodes(n = 10) {
  return Array.from({ length: n }, () => randomBytes(5).toString('hex').match(/.{5}/g).join('-'));
}
export function hashRecovery(code, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(code, salt, 32).toString('hex')}`;
}
export function checkRecovery(code, stored) {
  const [salt, h] = stored.split(':');
  return safeEqualHex(scryptSync(code, salt, 32).toString('hex'), h);
}

// Step-up: last passkey assertion within maxAgeMs.
export function stepUpFresh(session, now = Date.now(), maxAgeMs = 120_000) {
  return !!session && typeof session.stepUpAt === 'number' && now - session.stepUpAt <= maxAgeMs;
}
