import { createHmac } from 'node:crypto';
import { safeEqualString } from './crypto.js';

export const INKBOX_MAX_SKEW_MS = 300_000;

export function verifyInkboxSignature({
  secret,
  requestId,
  timestamp,
  rawBody,
  signature,
  now = Date.now(),
  maxSkewMs = INKBOX_MAX_SKEW_MS,
} = {}) {
  if (!secret || !requestId || !timestamp || signature == null || rawBody == null) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts * 1000) > maxSkewMs) return false;
  if (!String(signature).startsWith('sha256=')) return false;
  const provided = String(signature).slice(7);
  const key = String(secret).replace(/^whsec_/, '');
  const hmac = createHmac('sha256', key);
  hmac.update(`${requestId}.${timestamp}.`);
  hmac.update(typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody);
  return safeEqualString(hmac.digest('hex'), provided.toLowerCase());
}

export function verifyTwilioSignature({ authToken, url, params, signature } = {}) {
  if (!authToken || !url || !params || !signature) return false;
  const data = url + Object.keys(params).sort().map(key => key + String(params[key] ?? '')).join('');
  const expected = createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
  return safeEqualString(expected, signature);
}

export function header(headers, name) {
  if (!headers) return '';
  const target = name.toLowerCase();
  if (typeof headers.get === 'function') return headers.get(name) || headers.get(target) || '';
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return Array.isArray(value) ? value[0] : value || '';
  }
  return '';
}
