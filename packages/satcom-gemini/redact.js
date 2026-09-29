import { secretValues } from './keys.js';

const GEMINI_KEY = /AIza[0-9A-Za-z_\-]{20,}/g;

export function redact(text, env = {}) {
  if (text == null) return '';
  let out = String(text);
  for (const key of secretValues(env)) {
    if (key) out = out.split(key).join('***');
  }
  out = out.replace(/([?&]key=)[^&\s"']+/gi, '$1***');
  out = out.replace(/(x-goog-api-key["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1***');
  out = out.replace(/(authorization["']?\s*[:=]\s*["']?(?:bearer\s+)?)[^\s"',}]+/gi, '$1***');
  out = out.replace(GEMINI_KEY, '***');
  return out;
}

export function providerError(provider, status, env, body = '') {
  const e = new Error(redact(`${provider} request failed${status ? ` (${status})` : ''}. Check the API key, model and quota.`, env));
  e.status = status >= 400 && status < 600 ? (status === 429 ? 429 : 502) : 502;
  e.expose = true;
  e.body = redact(body, env).slice(0, 400);
  return e;
}
