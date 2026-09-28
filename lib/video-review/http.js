import { z } from 'zod';
import { randomToken, readSignedPayload, safeEqualString, sha256Hex, signPayload } from './crypto.js';
import { createSmsAdapter } from './sms.js';
import { createReviewStore, reviewStoreConfigured } from './store.js';
import {
  consumeMagicLink,
  decidePendingVideo,
  handleInboundSms,
  listPendingForReview,
  publicBaseUrl,
  submitForReview,
} from './service.js';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const httpsUrl = z.string().url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Use an HTTPS URL without credentials');

export const submitVideoSchema = z.object({
  id: slug,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1000).default(''),
  creator: slug.default('paul-hill'),
  credit: z.string().trim().min(1).max(200),
  publications: z.array(slug).min(1).max(30),
  towns: z.array(slug).max(30).default([]),
  kind: z.enum(['recorded', 'live']).default('recorded'),
  published_at: z.string().datetime({ offset: true }).optional(),
  live_confirmed_at: z.string().datetime({ offset: true }).optional(),
  poster_url: httpsUrl.optional(),
  playback: z.discriminatedUnion('type', [
    z.object({ type: z.literal('mp4'), url: httpsUrl }),
    z.object({ type: z.literal('hls'), url: httpsUrl }),
    z.object({ type: z.literal('youtube'), video_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/) }),
  ]),
  captions: z.array(z.object({
    url: httpsUrl, language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/), label: z.string().max(80),
  })).max(10).default([]),
});

export function readRawBody(req, limit = 64_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on('data', chunk => {
      length += chunk.length;
      if (length > limit) {
        reject(new Error('too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function cookieSecure(env) {
  return String(env.SATCOM_VIDEO_PUBLIC_URL || '').startsWith('https:') || Boolean(env.VERCEL);
}

function cookie(name, value, { env, maxAge, httpOnly = true }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `Max-Age=${maxAge}`, 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');
  if (cookieSecure(env)) parts.push('Secure');
  return parts.join('; ');
}

function json(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(headers)) {
    if (key === 'Set-Cookie' && Array.isArray(value)) value.forEach(item => res.appendHeader?.('Set-Cookie', item) || res.setHeader('Set-Cookie', item));
    else if (key === 'Set-Cookie') res.appendHeader?.('Set-Cookie', value) || res.setHeader('Set-Cookie', value);
    else res.setHeader(key, value);
  }
  res.end(JSON.stringify(body));
}

function wantsHtml(req) {
  return String(req.headers?.accept || '').includes('text/html') || String(req.headers?.['content-type'] || '').includes('application/x-www-form-urlencoded');
}

function allowedOrigins(req, env) {
  const origins = new Set();
  for (const value of [env.SATCOM_VIDEO_PUBLIC_URL, env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '']) {
    if (!value) continue;
    try { origins.add(new URL(value).origin); } catch { /* ignore invalid operator URL */ }
  }
  const host = req.headers?.host;
  if (host) origins.add(`${host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https'}://${host}`);
  return origins;
}

function sameOrigin(req, env) {
  const origin = req.headers?.origin;
  if (!origin) {
    const referer = req.headers?.referer;
    if (!referer) return false;
    try { return allowedOrigins(req, env).has(new URL(referer).origin); } catch { return false; }
  }
  try { return allowedOrigins(req, env).has(new URL(origin).origin); } catch { return false; }
}

function sessionSecret(env) {
  return env.SATCOM_VIDEO_SESSION_SECRET || '';
}

function readSession(req, env, type, now) {
  const cookies = parseCookies(req.headers?.cookie);
  const name = type === 'review' ? 'satcom_vr' : 'satcom_vs';
  const payload = readSignedPayload(cookies[name], sessionSecret(env), now);
  if (!payload || payload.typ !== type) return null;
  return payload;
}

function makeSession(type, subject, env, now, hours = 48) {
  const csrf = randomToken(18);
  const exp = Math.floor((now + hours * 3600_000) / 1000);
  return { token: signPayload({ typ: type, sub: subject, csrf, exp }, sessionSecret(env)), csrf, exp };
}

async function parseJsonOrForm(req, raw) {
  const type = String(req.headers?.['content-type'] || '');
  const text = raw.toString('utf8');
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text));
  if (!text) return {};
  return JSON.parse(text);
}

function depsFrom(options) {
  const env = options.env || process.env;
  const store = options.store || createReviewStore({ env, fetchImpl: options.fetchImpl });
  const sms = options.sms || createSmsAdapter({ env, fetchImpl: options.fetchImpl, logger: options.logger });
  const clock = options.clock || Date.now;
  return { env, store, sms, clock };
}

export function createSmsWebhookHandler(options = {}) {
  return async function handler(req, res) {
    const { env, store, sms, clock } = depsFrom(options);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'POST only' });
    }
    if (!store) return json(res, 503, { error: 'Video review is not configured.' });
    let rawBody;
    try { rawBody = await readRawBody(req); }
    catch { return json(res, 413, { error: 'Payload too large' }); }
    try {
      const result = await handleInboundSms({ store, sms, env, headers: req.headers, rawBody, now: clock() });
      return json(res, result.status, result.body);
    } catch {
      return json(res, 503, { error: 'Video review is temporarily unavailable.' });
    }
  };
}

export function createSessionHandler(options = {}) {
  return async function handler(req, res) {
    const { env, store, clock } = depsFrom(options);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'POST only' });
    }
    if (!store || !sessionSecret(env)) return json(res, 503, { error: 'Video review is not configured.' });
    let raw;
    try { raw = await readRawBody(req); }
    catch { return json(res, 413, { error: 'Payload too large' }); }
    let token;
    try { token = (await parseJsonOrForm(req, raw)).token; }
    catch { return json(res, 400, { error: 'Invalid request' }); }
    const reviewer = await consumeMagicLink({ store, token, now: clock() });
    if (!reviewer) {
      if (wantsHtml(req)) {
        res.statusCode = 303;
        res.setHeader('Location', '/video/review-continue?error=invalid');
        res.end();
        return;
      }
      return json(res, 401, { error: 'This review link is invalid, expired, or already used.' });
    }
    const session = makeSession('review', reviewer.id, env, clock(), 48);
    const setCookie = cookie('satcom_vr', session.token, { env, maxAge: 48 * 3600 });
    if (wantsHtml(req)) {
      res.statusCode = 303;
      res.setHeader('Set-Cookie', setCookie);
      res.setHeader('Location', '/video/review');
      res.end();
      return;
    }
    return json(res, 200, { ok: true, csrf: session.csrf }, { 'Set-Cookie': setCookie });
  };
}

export function createPendingHandler(options = {}) {
  return async function handler(req, res) {
    const { env, store, clock } = depsFrom(options);
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'GET only' });
    }
    if (!store || !sessionSecret(env)) return json(res, 503, { error: 'Video review is not configured.' });
    const session = readSession(req, env, 'review', clock());
    if (!session) return json(res, 401, { error: 'Open the secure link from your SMS and tap Continue.' });
    const items = await listPendingForReview(store, clock());
    return json(res, 200, { items, csrf: session.csrf, count: items.length });
  };
}

export function createDecideHandler(options = {}) {
  return async function handler(req, res) {
    const { env, store, sms, clock } = depsFrom(options);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'POST only' });
    }
    if (!store || !sessionSecret(env)) return json(res, 503, { error: 'Video review is not configured.' });
    if (!sameOrigin(req, env)) return json(res, 403, { error: 'Invalid origin' });
    const session = readSession(req, env, 'review', clock());
    if (!session) return json(res, 401, { error: 'Session expired. Open a new SMS link.' });
    let raw;
    try { raw = await readRawBody(req); }
    catch { return json(res, 413, { error: 'Payload too large' }); }
    let payload;
    try { payload = await parseJsonOrForm(req, raw); }
    catch { return json(res, 400, { error: 'Invalid request' }); }
    if (!payload.csrf || payload.csrf !== session.csrf) return json(res, 403, { error: 'Invalid CSRF token' });
    const decision = payload.decision === 'reject' || payload.decision === 'NO' ? 'reject' : payload.decision === 'approve' || payload.decision === 'YES' ? 'approve' : null;
    if (!decision || !payload.id) return json(res, 400, { error: 'id and decision are required' });
    const result = await decidePendingVideo({
      store, sms, env,
      videoId: payload.id,
      decision,
      deciderId: session.sub,
      reason: payload.reason || null,
      source: 'dashboard',
      now: clock(),
    });
    if (!result.ok) return json(res, 409, { error: 'This video is no longer pending.' });
    return json(res, 200, { ok: true, video: pendingSafe(result.video) });
  };
}

function pendingSafe(video) {
  return { id: video.id, title: video.title, status: video.status, short_code: video.short_code };
}

export function createLoginHandler(options = {}) {
  return async function handler(req, res) {
    const { env, clock } = depsFrom(options);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'POST only' });
    }
    if (!env.SATCOM_VIDEO_SUBMIT_USER || !env.SATCOM_VIDEO_SUBMIT_PASSWORD || !sessionSecret(env)) {
      return json(res, 503, { error: 'Submit login is not configured.' });
    }
    if (!sameOrigin(req, env)) return json(res, 403, { error: 'Invalid origin' });
    let raw;
    try { raw = await readRawBody(req); }
    catch { return json(res, 413, { error: 'Payload too large' }); }
    let payload;
    try { payload = await parseJsonOrForm(req, raw); }
    catch { return json(res, 400, { error: 'Invalid request' }); }
    const userOk = safeEqualString(sha256Hex(String(payload.user || '')), sha256Hex(env.SATCOM_VIDEO_SUBMIT_USER));
    const passOk = safeEqualString(sha256Hex(String(payload.password || '')), sha256Hex(env.SATCOM_VIDEO_SUBMIT_PASSWORD));
    if (!userOk || !passOk) {
      return json(res, 401, { error: 'Invalid credentials' });
    }
    const session = makeSession('submit', 'editor', env, clock(), 12);
    return json(res, 200, { ok: true, csrf: session.csrf }, { 'Set-Cookie': cookie('satcom_vs', session.token, { env, maxAge: 12 * 3600 }) });
  };
}

export function createSubmitHandler(options = {}) {
  return async function handler(req, res) {
    const { env, store, sms, clock } = depsFrom(options);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'POST only' });
    }
    if (!store || !sessionSecret(env)) return json(res, 503, { error: 'Video review is not configured.' });
    if (!sameOrigin(req, env)) return json(res, 403, { error: 'Invalid origin' });
    const session = readSession(req, env, 'submit', clock());
    if (!session) return json(res, 401, { error: 'Sign in to submit a video.' });
    let raw;
    try { raw = await readRawBody(req); }
    catch { return json(res, 413, { error: 'Payload too large' }); }
    let payload;
    try { payload = await parseJsonOrForm(req, raw); }
    catch { return json(res, 400, { error: 'Invalid request' }); }
    if (!payload.csrf || payload.csrf !== session.csrf) return json(res, 403, { error: 'Invalid CSRF token' });
    let video;
    try { video = submitVideoSchema.parse(payload.video || payload); }
    catch {
      return json(res, 400, { error: 'Use a valid video payload. Playback URLs must be HTTPS.' });
    }
    try {
      const created = await submitForReview({ store, sms, env, video, now: clock() });
      return json(res, 201, { ok: true, id: created.id, short_code: created.short_code, status: created.status });
    } catch {
      return json(res, 503, { error: 'Could not submit this video for review.' });
    }
  };
}

export function configured() {
  return reviewStoreConfigured();
}
