import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { parseReviewReply } from '../lib/video-review/parse-reply.js';
import { normalizePhone } from '../lib/video-review/phones.js';
import { verifyInkboxSignature, verifyTwilioSignature } from '../lib/video-review/signatures.js';
import { applyDecision, canDecide, nextStatusForDecision } from '../lib/video-review/transitions.js';
import { createMemoryStore } from '../lib/video-review/store.js';
import { createSmsAdapter } from '../lib/video-review/sms.js';
import {
  consumeMagicLink,
  decidePendingVideo,
  handleInboundSms,
  issueMagicLink,
} from '../lib/video-review/service.js';
import {
  createDecideHandler,
  createLoginHandler,
  createPendingHandler,
  createSessionHandler,
  createSmsWebhookHandler,
  createSubmitHandler,
} from '../lib/video-review/http.js';
import { createVideoHandler } from '../api/videos.js';
import { readCatalog } from '../lib/video-feed.js';
import { sha256Hex } from '../lib/video-review/crypto.js';

const now = Date.parse('2026-09-27T18:00:00Z');
const envBase = {
  SATCOM_VIDEO_PUBLIC_URL: 'https://satcom.5280.menu',
  SATCOM_VIDEO_SESSION_SECRET: 'test-session-secret-32-bytes-minimum',
  SATCOM_VIDEO_SUBMIT_USER: 'editor',
  SATCOM_VIDEO_SUBMIT_PASSWORD: 'correct-horse',
  INKBOX_WEBHOOK_SECRET: 'test-signing-key',
  SMS_DRY_RUN: 'true',
  SATCOM_VIDEO_SMS_PROVIDER: 'inkbox',
};

function inkboxSignature(secret, requestId, timestamp, body) {
  const hmac = createHmac('sha256', secret.replace(/^whsec_/, ''));
  hmac.update(`${requestId}.${timestamp}.`);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

function pendingClip(overrides = {}) {
  return {
    id: 'field-report',
    title: 'A report',
    description: '',
    creator: 'paul-hill',
    credit: 'Paul Hill',
    publications: ['network'],
    towns: ['idaho-springs'],
    status: 'pending_review',
    short_code: 'K7Q2',
    kind: 'recorded',
    playback: { type: 'mp4', url: 'https://media.example.org/report.mp4' },
    captions: [],
    submitted_at: '2026-09-27T16:00:00Z',
    review_requested_at: '2026-09-27T16:00:00Z',
    code_expires_at: '2026-09-30T16:00:00Z',
    ...overrides,
  };
}

function recordingSms() {
  const sent = [];
  return {
    name: 'inkbox',
    dryRun: true,
    verifyInbound() { return { ok: true }; },
    parseInbound({ rawBody }) { return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody); },
    async send(message) {
      sent.push(message);
      return { id: `out-${sent.length}`, dryRun: true };
    },
    sent,
  };
}

async function seededStore() {
  const store = createMemoryStore({ now: () => now });
  await store.addReviewer({ id: 'rev-1', phone_e164: '+15555550123', opted_in: true });
  return store;
}

function response() {
  const cookies = [];
  return {
    headers: {},
    cookies,
    statusCode: 0,
    body: undefined,
    setHeader(key, value) { this.headers[key] = value; if (key === 'Set-Cookie') cookies.push(value); },
    appendHeader(key, value) { if (key === 'Set-Cookie') { cookies.push(value); this.headers[key] = value; } else this.headers[key] = value; },
    end(value) { this.body = value; },
  };
}

function incoming(method, url, { headers = {}, body } = {}) {
  const req = {
    method,
    url,
    headers: { host: 'satcom.5280.menu', origin: 'https://satcom.5280.menu', ...headers },
    on(event, fn) {
      if (event === 'data') queueMicrotask(() => { if (body != null) fn(Buffer.from(body)); });
      if (event === 'end') queueMicrotask(fn);
      return req;
    },
    destroy() {},
  };
  return req;
}

test('review replies parse YES/NO codes, reasons, and keywords', () => {
  assert.deepEqual(parseReviewReply('YES K7Q2'), { type: 'decision', decision: 'approve', code: 'K7Q2', reason: null });
  assert.deepEqual(parseReviewReply('y k7q2 looks good'), { type: 'decision', decision: 'approve', code: 'K7Q2', reason: 'looks good' });
  assert.deepEqual(parseReviewReply('APPROVE K7Q2'), { type: 'decision', decision: 'approve', code: 'K7Q2', reason: null });
  assert.deepEqual(parseReviewReply('NO K7Q2 needs captions'), { type: 'decision', decision: 'reject', code: 'K7Q2', reason: 'needs captions' });
  assert.deepEqual(parseReviewReply('n k7q2'), { type: 'decision', decision: 'reject', code: 'K7Q2', reason: null });
  assert.deepEqual(parseReviewReply('REJECT K7Q2'), { type: 'decision', decision: 'reject', code: 'K7Q2', reason: null });
  assert.deepEqual(parseReviewReply('YES'), { type: 'decision', decision: 'approve', code: null, reason: null });
  assert.deepEqual(parseReviewReply('STOP'), { type: 'stop' });
  assert.deepEqual(parseReviewReply('HELP'), { type: 'help' });
  assert.deepEqual(parseReviewReply('START'), { type: 'start' });
  assert.equal(parseReviewReply('SHIP IT').type, 'unknown');
});

test('phone allowlist uses E.164 and rejects junk', () => {
  assert.equal(normalizePhone('(555) 555-0123'), '+15555550123');
  assert.equal(normalizePhone('+1 555 555 0123'), '+15555550123');
  assert.equal(normalizePhone('not-a-phone'), null);
});

test('Inkbox signatures require HMAC, timestamp window, and sha256 prefix', () => {
  const body = '{"event_type":"text.received"}';
  const timestamp = String(Math.floor(now / 1000));
  const signature = inkboxSignature('test-signing-key', 'req_1', timestamp, body);
  assert.equal(verifyInkboxSignature({ secret: 'whsec_test-signing-key', requestId: 'req_1', timestamp, rawBody: body, signature, now }), true);
  assert.equal(verifyInkboxSignature({ secret: 'test-signing-key', requestId: 'req_1', timestamp, rawBody: '{"tampered":true}', signature, now }), false);
  assert.equal(verifyInkboxSignature({ secret: 'test-signing-key', requestId: 'req_1', timestamp, rawBody: body, signature: signature.slice(7), now }), false);
  assert.equal(verifyInkboxSignature({ secret: 'test-signing-key', requestId: 'req_1', timestamp: String(Math.floor(now / 1000) - 400), rawBody: body, signature: inkboxSignature('test-signing-key', 'req_1', String(Math.floor(now / 1000) - 400), body), now }), false);
});

test('Twilio signatures hash the configured public URL and sorted params', () => {
  const params = { Body: 'YES K7Q2', From: '+15555550123', To: '+15555550000', MessageSid: 'SM1' };
  const url = 'https://satcom.5280.menu/api/video-review-sms';
  const data = url + Object.keys(params).sort().map(key => key + params[key]).join('');
  const signature = createHmac('sha1', 'twilio-token').update(data, 'utf8').digest('base64');
  assert.equal(verifyTwilioSignature({ authToken: 'twilio-token', url, params, signature }), true);
  assert.equal(verifyTwilioSignature({ authToken: 'twilio-token', url, params: { ...params, Body: 'NO' }, signature }), false);
});

test('pending videos transition only once and expired codes fail closed', () => {
  const video = pendingClip();
  assert.equal(nextStatusForDecision('approve'), 'published');
  assert.equal(canDecide(video, now).ok, true);
  const approved = applyDecision(video, { status: 'published', deciderId: 'rev-1', source: 'sms', now });
  assert.equal(approved.ok, true);
  assert.equal(approved.video.status, 'published');
  assert.equal(canDecide(approved.video, now).ok, false);
  assert.equal(canDecide(pendingClip({ code_expires_at: '2026-09-27T17:00:00Z' }), now).ok, false);
});

test('SMS_DRY_RUN defaults on and never calls the provider', async () => {
  let calls = 0;
  const sms = createSmsAdapter({
    env: { SATCOM_VIDEO_SMS_PROVIDER: 'inkbox' },
    fetchImpl: async () => { calls += 1; return new Response('nope', { status: 500 }); },
    logger: { info() {}, error() {} },
  });
  assert.equal(sms.dryRun, true);
  const result = await sms.send({ to: '+15555550123', body: 'test' });
  assert.equal(result.dryRun, true);
  assert.equal(calls, 0);
});

test('inbound SMS is allowlisted, idempotent, and can publish with YES CODE', async () => {
  const store = await seededStore();
  await store.insertVideo(pendingClip());
  const sms = recordingSms();
  const inbound = { provider: 'inkbox', messageId: 'msg-1', from: '+15555550123', to: '+15555550000', body: 'YES K7Q2' };
  const first = await handleInboundSms({ store, sms, env: envBase, headers: {}, rawBody: JSON.stringify(inbound), now });
  assert.equal(first.body.handled, 'published');
  assert.equal((await store.getVideoById('field-report')).status, 'published');
  const second = await handleInboundSms({ store, sms, env: envBase, headers: {}, rawBody: JSON.stringify(inbound), now });
  assert.equal(second.body.duplicate, true);
  assert.ok(sms.sent.some(item => /now live/i.test(item.body)));
  assert.ok(sms.sent.every(item => /Reply STOP to opt out/.test(item.body) || /opted out/.test(item.body)));
});

test('unknown senders and opted-out reviewers cannot decide', async () => {
  const store = await seededStore();
  await store.insertVideo(pendingClip());
  const sms = recordingSms();
  const stranger = await handleInboundSms({
    store, sms, env: envBase, headers: {}, now,
    rawBody: JSON.stringify({ provider: 'inkbox', messageId: 'msg-2', from: '+15555550999', to: '+15555550000', body: 'YES K7Q2' }),
  });
  assert.equal(stranger.body.handled, 'ignored');
  await store.setReviewerOptIn('rev-1', false, now);
  const opted = await handleInboundSms({
    store, sms, env: envBase, headers: {}, now,
    rawBody: JSON.stringify({ provider: 'inkbox', messageId: 'msg-3', from: '+15555550123', to: '+15555550000', body: 'YES K7Q2' }),
  });
  assert.equal(opted.body.handled, 'opted_out');
  assert.equal((await store.getVideoById('field-report')).status, 'pending_review');
});

test('START only opts in an allowlisted reviewer and STOP opts out', async () => {
  const store = createMemoryStore({ now: () => now });
  await store.addReviewer({ id: 'rev-1', phone_e164: '+15555550123', opted_in: false });
  const sms = recordingSms();
  const denied = await handleInboundSms({
    store, sms, env: envBase, headers: {}, now,
    rawBody: JSON.stringify({ provider: 'inkbox', messageId: 's1', from: '+15555550999', to: '+15555550000', body: 'START' }),
  });
  assert.equal(denied.body.handled, 'start_denied');
  const started = await handleInboundSms({
    store, sms, env: envBase, headers: {}, now,
    rawBody: JSON.stringify({ provider: 'inkbox', messageId: 's2', from: '+15555550123', to: '+15555550000', body: 'START' }),
  });
  assert.equal(started.body.handled, 'start');
  assert.equal((await store.getReviewerByPhone('+15555550123')).opted_in, true);
  const stopped = await handleInboundSms({
    store, sms, env: envBase, headers: {}, now,
    rawBody: JSON.stringify({ provider: 'inkbox', messageId: 's3', from: '+15555550123', to: '+15555550000', body: 'STOP' }),
  });
  assert.equal(stopped.body.handled, 'stop');
  assert.equal((await store.getReviewerByPhone('+15555550123')).opted_in, false);
});

test('bare YES works for exactly one pending video and expired codes are rejected', async () => {
  const store = await seededStore();
  await store.insertVideo(pendingClip());
  const sms = recordingSms();
  const published = await handleInboundSms({
    store, sms, env: envBase, headers: {}, now,
    rawBody: JSON.stringify({ provider: 'inkbox', messageId: 'b1', from: '+15555550123', to: '+15555550000', body: 'YES' }),
  });
  assert.equal(published.body.handled, 'published');
  const storeTwo = await seededStore();
  await storeTwo.insertVideo(pendingClip());
  await storeTwo.insertVideo(pendingClip({ id: 'second', short_code: 'M3P1' }));
  const needCode = await handleInboundSms({
    store: storeTwo, sms, env: envBase, headers: {}, now,
    rawBody: JSON.stringify({ provider: 'inkbox', messageId: 'b2', from: '+15555550123', to: '+15555550000', body: 'YES' }),
  });
  assert.equal(needCode.body.handled, 'need_code');
  const storeExpired = await seededStore();
  await storeExpired.insertVideo(pendingClip({ code_expires_at: '2026-09-27T17:00:00Z' }));
  const expired = await handleInboundSms({
    store: storeExpired, sms, env: envBase, headers: {}, now,
    rawBody: JSON.stringify({ provider: 'inkbox', messageId: 'b3', from: '+15555550123', to: '+15555550000', body: 'YES K7Q2' }),
  });
  assert.equal(expired.body.handled, 'expired');
});

test('magic links store only the hash and can be consumed once', async () => {
  const store = await seededStore();
  const reviewer = await store.getReviewerById('rev-1');
  const url = await issueMagicLink({ store, reviewer, env: envBase, now });
  const token = new URL(url).searchParams.get('token');
  assert.equal(token.length > 40, true);
  assert.equal(store.snapshot().magicLinks[0].token_hash, sha256Hex(token));
  assert.ok(!JSON.stringify(store.snapshot().magicLinks).includes(token));
  assert.equal((await consumeMagicLink({ store, token, now })).id, 'rev-1');
  assert.equal(await consumeMagicLink({ store, token, now }), null);
  const expiredUrl = await issueMagicLink({ store, reviewer, env: envBase, now });
  const expiredToken = new URL(expiredUrl).searchParams.get('token');
  assert.equal(await consumeMagicLink({ store, token: expiredToken, now: now + 80 * 3600_000 }), null);
});

test('Continue POST consumes the link; GET does not', async () => {
  const store = await seededStore();
  const reviewer = await store.getReviewerById('rev-1');
  const url = await issueMagicLink({ store, reviewer, env: envBase, now });
  const token = new URL(url).searchParams.get('token');
  const handler = createSessionHandler({ store, env: envBase, clock: () => now });
  const get = response();
  await handler(incoming('GET', '/api/video-review-session', { body: '' }), get);
  assert.equal(get.statusCode, 405);
  const consumed = response();
  await handler(incoming('POST', '/api/video-review-session', { headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ token }) }), consumed);
  assert.equal(consumed.statusCode, 200);
  const used = response();
  await handler(incoming('POST', '/api/video-review-session', { headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ token }) }), used);
  assert.equal(used.statusCode, 401);
});

test('review dashboard requires a session and CSRF-protects decisions', async () => {
  const store = await seededStore();
  await store.insertVideo(pendingClip());
  const sms = recordingSms();
  const reviewer = await store.getReviewerById('rev-1');
  const token = new URL(await issueMagicLink({ store, reviewer, env: envBase, now })).searchParams.get('token');
  const sessionHandler = createSessionHandler({ store, env: envBase, clock: () => now });
  const sessionRes = response();
  await sessionHandler(incoming('POST', '/api/video-review-session', { headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ token }) }), sessionRes);
  assert.equal(sessionRes.statusCode, 200);
  const cookie = sessionRes.cookies[0].split(';')[0];
  const csrf = JSON.parse(sessionRes.body).csrf;
  const pending = createPendingHandler({ store, env: envBase, clock: () => now });
  const list = response();
  await pending(incoming('GET', '/api/video-review-pending', { headers: { cookie } }), list);
  assert.equal(JSON.parse(list.body).items[0].id, 'field-report');
  const decide = createDecideHandler({ store, sms, env: envBase, clock: () => now });
  const badCsrf = response();
  await decide(incoming('POST', '/api/video-review-decide', { headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'field-report', decision: 'approve', csrf: 'nope' }) }), badCsrf);
  assert.equal(badCsrf.statusCode, 403);
  const ok = response();
  await decide(incoming('POST', '/api/video-review-decide', { headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'field-report', decision: 'approve', csrf }) }), ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(JSON.parse(ok.body).video.status, 'published');
});

test('submit login creates a pending video and dry-run review SMS', async () => {
  const store = await seededStore();
  const sms = recordingSms();
  const login = createLoginHandler({ env: envBase, clock: () => now });
  const logged = response();
  await login(incoming('POST', '/api/video-review-login', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'editor', password: 'correct-horse' }) }), logged);
  assert.equal(logged.statusCode, 200);
  const cookie = logged.cookies[0].split(';')[0];
  const csrf = JSON.parse(logged.body).csrf;
  const submit = createSubmitHandler({ store, sms, env: envBase, clock: () => now });
  const created = response();
  await submit(incoming('POST', '/api/video-review-submit', {
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      csrf,
      video: {
        id: 'paul-hill-test-001', title: 'Test report', creator: 'paul-hill', credit: 'Paul Hill',
        publications: ['network'], playback: { type: 'mp4', url: 'https://media.example.org/a.mp4' },
      },
    }),
  }), created);
  assert.equal(created.statusCode, 201);
  assert.equal(JSON.parse(created.body).status, 'pending_review');
  assert.ok(sms.sent.some(item => /ready for review/.test(item.body)));
});

test('webhook rejects bad signatures and the public video API stays read-only', async () => {
  const store = await seededStore();
  const handler = createSmsWebhookHandler({
    store,
    env: envBase,
    clock: () => now,
    sms: createSmsAdapter({ env: envBase, logger: { info() {}, error() {} } }),
  });
  const denied = response();
  await handler(incoming('POST', '/api/video-review-sms', { headers: { 'content-type': 'application/json' }, body: '{"event_type":"text.received"}' }), denied);
  assert.equal(denied.statusCode, 401);
  const publicApi = createVideoHandler(async () => ({ catalog: { version: 1, items: [] }, source: 'catalog' }), () => now);
  const write = response();
  await publicApi({ method: 'POST', url: '/api/videos' }, write);
  assert.equal(write.statusCode, 405);
});

test('configured Supabase catalog publishes only published rows and falls back to JSON otherwise', async () => {
  const env = {
    SATCOM_VIDEO_SUPABASE_URL: 'https://example.supabase.co',
    SATCOM_VIDEO_SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  };
  let request;
  const result = await readCatalog({
    env,
    fetchImpl: async (url) => {
      request = String(url);
      return new Response(JSON.stringify([pendingClip({ status: 'published', published_at: '2026-09-26T18:00:00Z' })]));
    },
  });
  assert.equal(result.source, 'satcom-video-db');
  assert.match(request, /status=eq.published/);
  assert.equal(result.catalog.items[0].status, 'published');
  const fallback = await readCatalog({ env: {} });
  assert.equal(fallback.source, 'catalog');
  assert.deepEqual(fallback.catalog.items, []);
});

test('dashboard publish also notifies reviewers', async () => {
  const store = await seededStore();
  await store.insertVideo(pendingClip());
  const sms = recordingSms();
  const result = await decidePendingVideo({
    store, sms, env: envBase, videoId: 'field-report', decision: 'approve', deciderId: 'rev-1', source: 'dashboard', now,
  });
  assert.equal(result.ok, true);
  assert.ok(sms.sent.some(item => /now live/i.test(item.body)));
});

test('subscription host redirects and other host routes stay untouched', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
  assert.deepEqual(config.redirects, [
    { source: '/data/video-feed.json', destination: '/api/videos', permanent: false },
    { source: '/', has: [{ type: 'host', value: 'subscribe.thevillager.today' }], destination: '/subscribe-villager/', permanent: false },
  ]);
  assert.ok(config.rewrites.some(rule => rule.destination === 'https://codex.conews.press/api/v1/platform/hermes/:path*'));
  assert.ok(config.rewrites.some(rule => rule.source === '/video/review' && rule.destination === '/video/review.html'));
  assert.ok(!JSON.stringify(config).includes('villager-postcard-gallery'));
  assert.ok(!JSON.stringify(config).includes('villager-postcard-proofing'));
});
