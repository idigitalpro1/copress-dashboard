import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'satcom_studio';
const SESSION_SECONDS = 12 * 3600;

// The studio is disabled unless VIDEO_STUDIO_PASSWORD is set to 12+ characters.
export function studioEnabled(env) {
  return typeof env.VIDEO_STUDIO_PASSWORD === 'string' && env.VIDEO_STUDIO_PASSWORD.length >= 12;
}

function sessionKey(env) {
  // Changing the password invalidates every session.
  return createHmac('sha256', env.VIDEO_STUDIO_PASSWORD).update('satcom-video-studio-session-v1').digest();
}

export function safeEqual(a, b) {
  const x = createHash('sha256').update(String(a)).digest();
  const y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
}

export function passwordMatches(env, candidate) {
  return studioEnabled(env) && typeof candidate === 'string' && candidate.length <= 512 && safeEqual(candidate, env.VIDEO_STUDIO_PASSWORD);
}

export function issueSession(env, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ sub: 'studio', exp: Math.floor(now / 1000) + SESSION_SECONDS })).toString('base64url');
  const sig = createHmac('sha256', sessionKey(env)).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(env, token, now = Date.now()) {
  if (!studioEnabled(env) || typeof token !== 'string' || token.length > 1024) return false;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return false;
  const expected = createHmac('sha256', sessionKey(env)).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload?.sub === 'studio' && Number.isFinite(payload.exp) && payload.exp * 1000 > now;
  } catch { return false; }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(env, token, maxAge = SESSION_SECONDS) {
  // Lax (not Strict) so the cookie is sent on Google's top-level OAuth redirect
  // back to /api/studio/youtube-callback. CSRF still requires X-Studio-Request on
  // POST and a signed OAuth state on the callback.
  const parts = [`${SESSION_COOKIE}=${token}`, 'Path=/api/studio', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (env.VERCEL || env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}
