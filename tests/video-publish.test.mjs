import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioHandler } from '../lib/video-studio/handler.js';
import { createPublishMemoryStore } from '../lib/video-studio/publish/store.js';
import { saveTokens } from '../lib/video-studio/publish/youtube.js';
import { evaluateGate, isSyntheticClip, withAiDisclosure, originalFromSidecar } from '../lib/video-studio/publish/gate.js';
import { idempotencyKey } from '../lib/video-studio/publish/ids.js';
import { encryptJson, decryptJson } from '../lib/video-studio/publish/crypto.js';
import { sanitizeAuditMetadata } from '../lib/video-studio/publish/audit.js';
import { mergeCatalogs } from '../lib/video-studio/publish/overlay.js';
import { publicCatalog, readCatalog } from '../lib/video-feed.js';
import { createYoutubeCallbackHandler } from '../lib/video-studio/publish/oauth-callback.js';
import { signOauthState } from '../lib/video-studio/publish/youtube.js';
import { issueSession, sessionCookie } from '../lib/video-studio/auth.js';

const PASSWORD = 'correct horse battery staple';
const CLOUD = { CLOUDINARY_URL: 'cloudinary://111222333:cloud-secret-value@satcomtest' };
const ENC_KEY = 'ab'.repeat(32);
const NOW = Date.parse('2026-09-29T20:00:00Z');
const YT = {
  YOUTUBE_CLIENT_ID: 'yt-client.apps.googleusercontent.com',
  YOUTUBE_CLIENT_SECRET: 'yt-client-secret-value',
  YOUTUBE_TOKEN_ENC_KEY: ENC_KEY,
  YOUTUBE_REDIRECT_URI: 'https://preview.example/api/studio/youtube-callback',
  YOUTUBE_DEFAULT_PRIVACY: 'unlisted',
};

function response() {
  return { headers: {}, statusCode: 0, body: undefined, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = v; }, get json() { return JSON.parse(this.body); } };
}
async function call(handler, { method = 'POST', body, cookie, header = true, ip = '203.0.113.80', url = '/api/studio' } = {}) {
  const res = response();
  await handler({
    method, url, body,
    headers: { ...(header ? { 'x-studio-request': '1' } : {}), ...(cookie ? { cookie } : {}), 'x-forwarded-for': ip },
  }, res);
  return res;
}
async function login(handler, ip = '203.0.113.81') {
  const res = await call(handler, { body: { op: 'login', password: PASSWORD }, ip });
  assert.equal(res.statusCode, 200, res.body);
  return res.headers['Set-Cookie'].split(';')[0];
}

const source = { public_id: 'satcom/generated/genesee-evening', type: 'private', duration: 8 };
const sidecar = {
  model: 'gemini-omni-1.1-flash',
  prompt: 'Genesee evening update',
  resolution: '1080p',
  duration: 8,
  aspect: '16:9',
  timestamp: '2026-09-29T20:00:00.000Z',
  synthid_note: 'SynthID watermark.',
  original_public_id: 'satcom/paul-hill/originals/genesee-source',
  source_type: 'authenticated',
};
const reviewed = {
  title: 'Genesee evening update',
  description: 'Paul Hill reports from Genesee.',
  tags: ['ClearCreek'],
  captions: '1\n00:00:00,000 --> 00:00:02,000\nEvening light',
  credit_name: 'Paul Hill',
  shoot_date: '2026-09-29',
  review: { title: true, description: true, captions: true, tags: true },
  consent: { people: true, music: true, paul_hill: true },
  asset_tags: ['satcom-generated', 'ai-generated', 'gemini-omni', 'draft'],
  sidecar,
  source,
};

function mockFetch({ youtubeUploads = [], cloudinaryUploads = [], failSatcom = false, youtubeId = 'dQw4w9wgXcQ' } = {}) {
  return async (url, options = {}) => {
    const u = String(url);
    const method = (options.method || 'GET').toUpperCase();
    if (u.includes('/resources/search')) {
      return Response.json({ resources: [] });
    }
    if (u.includes('res.cloudinary.com') && u.includes('/raw/upload/satcom-studio/published/catalog')) {
      return new Response('not found', { status: 404 });
    }
    if (u.includes('res.cloudinary.com')) {
      return new Response(Buffer.from('fake-mp4-bytes'), { status: 200, headers: { 'content-type': 'video/mp4' } });
    }
    if (u.includes('api.cloudinary.com') && u.includes('/video/upload')) {
      if (failSatcom) return new Response(JSON.stringify({ error: { message: 'denied' } }), { status: 500 });
      cloudinaryUploads.push({ kind: 'video', url: u });
      return Response.json({ public_id: 'satcom/published/satcom--generated--genesee-evening', type: 'upload' });
    }
    if (u.includes('api.cloudinary.com') && u.includes('/raw/upload')) {
      cloudinaryUploads.push({ kind: 'raw', url: u });
      return Response.json({ public_id: 'satcom-studio/published/catalog', type: 'upload' });
    }
    if (u.startsWith('https://www.googleapis.com/upload/youtube/v3/videos') && method === 'POST') {
      const resource = JSON.parse(options.body);
      youtubeUploads.push(resource);
      return new Response('', { status: 200, headers: { Location: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=session1' } });
    }
    if (u.startsWith('https://www.googleapis.com/upload/youtube/v3/videos?upload_id=') && method === 'PUT') {
      const last = youtubeUploads[youtubeUploads.length - 1];
      return Response.json({
        id: youtubeId,
        status: { privacyStatus: last?.status?.privacyStatus, containsSyntheticMedia: last?.status?.containsSyntheticMedia },
      });
    }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/videos') && method === 'PUT') {
      youtubeUploads.push({ update: JSON.parse(options.body) });
      return Response.json({ id: JSON.parse(options.body).id });
    }
    if (u.includes('youtube/v3/videos') && method === 'DELETE') {
      youtubeUploads.push({ delete: u });
      return new Response(null, { status: 204 });
    }
    if (u.startsWith('https://oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'ya29.access', refresh_token: '1//refresh', expires_in: 3600, token_type: 'Bearer' });
    }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/channels')) {
      return Response.json({ items: [{ id: 'UC123', snippet: { title: 'Colorado News Press' } }] });
    }
    const error = new Error('unexpected fetch ' + method + ' ' + u);
    error.status = 502;
    error.expose = true;
    throw error;
  };
}

test('review gate blocks unreviewed AI fields, missing name/date, and missing consent', () => {
  const base = { ...reviewed, review: { title: false, description: true, captions: true, tags: true } };
  const unreviewed = evaluateGate(base, { sidecar });
  assert.equal(unreviewed.ok, false);
  assert.ok(unreviewed.issues.some(i => /title/i.test(i)));
  const noName = evaluateGate({ ...reviewed, credit_name: '' }, { sidecar });
  assert.equal(noName.ok, false);
  const noDate = evaluateGate({ ...reviewed, shoot_date: '' }, { sidecar });
  assert.equal(noDate.ok, false);
  const noConsent = evaluateGate({ ...reviewed, consent: { people: false, music: true, paul_hill: true } }, { sidecar });
  assert.equal(noConsent.ok, false);
});

test('Omni clips force synthetic disclosure and the reviewer cannot uncheck it', () => {
  assert.equal(isSyntheticClip({ tags: reviewed.asset_tags, sidecar }), true);
  const forced = evaluateGate({ ...reviewed, contains_synthetic_media: false }, { sidecar });
  assert.equal(forced.ok, false);
  assert.match(forced.issues.join(' '), /cannot be turned off/i);
  const ok = evaluateGate(reviewed, { sidecar });
  assert.equal(ok.ok, true);
  assert.equal(ok.contains_synthetic_media, true);
  assert.match(ok.description, /AI-generated \(synthetic\) content/);
  assert.equal(originalFromSidecar(sidecar).public_id, 'satcom/paul-hill/originals/genesee-source');
  assert.match(withAiDisclosure('Hello', { required: true, synthidNote: 'SynthID', max: 1000 }), /SynthID/);
});

test('audit metadata never keeps PHI or copy text', () => {
  const clean = sanitizeAuditMetadata({
    youtube_video_id: 'dQw4w9wgXcQ',
    description: 'patient reports chest pain',
    title: 'secret',
    prompt: 'do not store',
    captions: 'nope',
    credit_name: 'Jane Doe',
  });
  const dumped = JSON.stringify(clean);
  assert.equal(clean.youtube_video_id, 'dQw4w9wgXcQ');
  assert.doesNotMatch(dumped, /chest pain|secret|do not store|nope|Jane Doe/);
});

test('token encryption round-trips and idempotency keys are stable', () => {
  const payload = { refresh_token: '1//abc', access_token: 'ya29.x' };
  const enc = encryptJson(payload, ENC_KEY);
  assert.notEqual(enc, JSON.stringify(payload));
  assert.deepEqual(decryptJson(enc, ENC_KEY), payload);
  const a = idempotencyKey('satcom/generated/x', 'ver1', 'youtube');
  const b = idempotencyKey('satcom/generated/x', 'ver1', 'youtube');
  const c = idempotencyKey('satcom/generated/x', 'ver1', 'satcom');
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('publish flow is disabled without YouTube env and the gate still answers', async () => {
  const handler = createStudioHandler({
    getEnv: () => ({ VIDEO_STUDIO_PASSWORD: PASSWORD, ...CLOUD }),
    fetchImpl: mockFetch(),
    clock: () => NOW,
    publishStore: createPublishMemoryStore(),
  });
  const cookie = await login(handler);
  const status = await call(handler, { method: 'GET', cookie });
  assert.equal(status.json.features.publish, false);
  assert.equal(status.json.publish.youtube_connected, false);
  assert.match(status.json.publish.notes.join(' '), /YOUTUBE_CLIENT_ID/);
  const evaluate = await call(handler, { cookie, body: { op: 'publish-evaluate', ...reviewed } });
  assert.equal(evaluate.statusCode, 200, evaluate.body);
  assert.equal(evaluate.json.blocked_reason, 'not_connected');
  const approve = await call(handler, { cookie, body: { op: 'publish-approve', ...reviewed } });
  assert.equal(approve.statusCode, 503);
  assert.match(approve.json.error, /disabled|not set/i);
});

test('side-by-side preview uses sidecar original and does not leak secrets', async () => {
  const handler = createStudioHandler({
    getEnv: () => ({ VIDEO_STUDIO_PASSWORD: PASSWORD, ...CLOUD }),
    fetchImpl: mockFetch(),
    clock: () => NOW,
    publishStore: createPublishMemoryStore(),
  });
  const cookie = await login(handler, '203.0.113.82');
  const prev = await call(handler, { cookie, body: { op: 'publish-preview', source, sidecar, asset_tags: reviewed.asset_tags } });
  assert.equal(prev.statusCode, 200, prev.body);
  assert.equal(prev.json.source.public_id, 'satcom/paul-hill/originals/genesee-source');
  assert.match(prev.json.source.preview_url, /\/video\/authenticated\//);
  assert.match(prev.json.draft.preview_url, /\/video\/private\//);
  assert.equal(prev.json.disclosure_locked, true);
  assert.doesNotMatch(prev.body, /cloud-secret-value|yt-client-secret/);
});

test('single approval publishes to YouTube and satcom without double-post on retry', async () => {
  const youtubeUploads = [];
  const cloudinaryUploads = [];
  const publishStore = createPublishMemoryStore();
  const env = { VIDEO_STUDIO_PASSWORD: PASSWORD, ...CLOUD, ...YT };
  await saveTokens(env, publishStore, { refresh_token: '1//refresh', access_token: 'ya29.access', expiry_ms: NOW + 3_600_000 });
  const handler = createStudioHandler({
    getEnv: () => env,
    fetchImpl: mockFetch({ youtubeUploads, cloudinaryUploads }),
    clock: () => NOW,
    publishStore,
  });
  const cookie = await login(handler, '203.0.113.83');
  const first = await call(handler, { cookie, body: { op: 'publish-approve', ...reviewed, youtube_privacy: 'unlisted' } });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json.contains_synthetic_media, true);
  const byTarget = Object.fromEntries(first.json.jobs.map(j => [j.target, j]));
  assert.equal(byTarget.youtube.status, 'succeeded');
  assert.equal(byTarget.youtube.youtube_video_id, 'dQw4w9wgXcQ');
  assert.equal(byTarget.satcom.status, 'succeeded');
  assert.match(byTarget.satcom.public_playback_url, /\/video\/upload\/satcom\/published\//);
  assert.equal(youtubeUploads.length, 1);
  assert.equal(youtubeUploads[0].status.privacyStatus, 'unlisted');
  assert.equal(youtubeUploads[0].status.containsSyntheticMedia, true);
  assert.match(youtubeUploads[0].snippet.description, /AI-generated \(synthetic\) content/);
  const second = await call(handler, { cookie, body: { op: 'publish-approve', ...reviewed, version: first.json.version } });
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(youtubeUploads.length, 1, 'retry must not double-post to YouTube');
  assert.equal(cloudinaryUploads.filter(c => c.kind === 'video').length, 1);
  const dumped = JSON.stringify(publishStore._audit);
  assert.doesNotMatch(dumped, /Paul Hill reports|Evening light|chest pain/);
});

test('partial failure leaves YouTube succeeded and satcom failed, then Retry repairs satcom', async () => {
  const youtubeUploads = [];
  const publishStore = createPublishMemoryStore();
  const env = { VIDEO_STUDIO_PASSWORD: PASSWORD, ...CLOUD, ...YT };
  await saveTokens(env, publishStore, { refresh_token: '1//refresh', access_token: 'ya29.access', expiry_ms: NOW + 3_600_000 });
  let satcomAttempts = 0;
  const fetchImpl = async (url, options) => {
    const u = String(url);
    if (u.includes('api.cloudinary.com') && u.includes('/video/upload')) {
      satcomAttempts += 1;
      if (satcomAttempts === 1) return new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 500 });
    }
    return mockFetch({ youtubeUploads })(url, options);
  };
  const handler = createStudioHandler({ getEnv: () => env, fetchImpl, clock: () => NOW, publishStore });
  const cookie = await login(handler, '203.0.113.84');
  const first = await call(handler, { cookie, body: { op: 'publish-approve', ...reviewed } });
  assert.equal(first.statusCode, 200, first.body);
  const jobs = Object.fromEntries(first.json.jobs.map(j => [j.target, j]));
  assert.equal(jobs.youtube.status, 'succeeded');
  assert.equal(jobs.satcom.status, 'failed');
  const retry = await call(handler, { cookie, body: { op: 'publish-retry', ...reviewed, target: 'satcom', version: first.json.version } });
  assert.equal(retry.statusCode, 200, retry.body);
  assert.equal(retry.json.job.status, 'succeeded');
  assert.equal(youtubeUploads.length, 1);
});

test('YouTube daily cap queues until tomorrow', async () => {
  const youtubeUploads = [];
  const publishStore = createPublishMemoryStore();
  const env = { VIDEO_STUDIO_PASSWORD: PASSWORD, ...CLOUD, ...YT, YOUTUBE_DAILY_UPLOAD_CAP: '1' };
  await saveTokens(env, publishStore, { refresh_token: '1//refresh', access_token: 'ya29.access', expiry_ms: NOW + 3_600_000 });
  const handler = createStudioHandler({
    getEnv: () => env,
    fetchImpl: mockFetch({ youtubeUploads }),
    clock: () => NOW,
    publishStore,
  });
  const cookie = await login(handler, '203.0.113.85');
  const a = await call(handler, { cookie, body: { op: 'publish-approve', ...reviewed } });
  assert.equal(a.json.jobs.find(j => j.target === 'youtube').status, 'succeeded');
  const b = await call(handler, { cookie, body: { op: 'publish-approve', ...reviewed, title: 'Second clip' } });
  const yt = b.json.jobs.find(j => j.target === 'youtube');
  assert.equal(yt.status, 'queued');
  assert.match(yt.error, /queued until tomorrow/);
  assert.ok(yt.run_after);
  assert.equal(youtubeUploads.length, 1);
  const status = await call(handler, { method: 'GET', cookie });
  assert.match(status.json.publish.quota.queued_until || '', /2026-09-30/);
});

test('unpublish sets YouTube private and removes the satcom overlay item', async () => {
  const youtubeUploads = [];
  const publishStore = createPublishMemoryStore();
  const env = { VIDEO_STUDIO_PASSWORD: PASSWORD, ...CLOUD, ...YT };
  await saveTokens(env, publishStore, { refresh_token: '1//refresh', access_token: 'ya29.access', expiry_ms: NOW + 3_600_000 });
  const handler = createStudioHandler({
    getEnv: () => env,
    fetchImpl: mockFetch({ youtubeUploads }),
    clock: () => NOW,
    publishStore,
  });
  const cookie = await login(handler, '203.0.113.86');
  const first = await call(handler, { cookie, body: { op: 'publish-approve', ...reviewed } });
  assert.equal(first.statusCode, 200, first.body);
  const version = first.json.version;
  const yt = await call(handler, { cookie, body: { op: 'publish-unpublish', ...reviewed, target: 'youtube', mode: 'private', version } });
  assert.equal(yt.statusCode, 200, yt.body);
  assert.equal(yt.json.job.status, 'unpublished');
  assert.ok(youtubeUploads.some(u => u.update?.status?.privacyStatus === 'private'));
  const sat = await call(handler, { cookie, body: { op: 'publish-unpublish', ...reviewed, target: 'satcom', version } });
  assert.equal(sat.statusCode, 200, sat.body);
  assert.equal(sat.json.job.status, 'unpublished');
  const del = await call(handler, { cookie, body: { op: 'publish-unpublish', ...reviewed, target: 'youtube', mode: 'delete', version } });
  assert.equal(del.statusCode, 200, del.body);
});

test('OAuth start lists the required scopes and callback stores an encrypted refresh token', async () => {
  const publishStore = createPublishMemoryStore();
  const env = { VIDEO_STUDIO_PASSWORD: PASSWORD, VERCEL: '1', ...YT };
  const fetchImpl = mockFetch();
  const handler = createStudioHandler({ getEnv: () => env, fetchImpl, clock: () => NOW, publishStore });
  const cookie = await login(handler, '203.0.113.87');
  const start = await call(handler, { cookie, body: { op: 'youtube-oauth-start' } });
  assert.equal(start.statusCode, 200, start.body);
  assert.match(start.json.url, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  assert.match(start.json.url, /youtube\.upload/);
  assert.match(start.json.url, /youtube\.force-ssl/);
  assert.match(start.json.url, /access_type=offline/);
  const cb = createYoutubeCallbackHandler({ getEnv: () => env, fetchImpl, clock: () => NOW, store: publishStore });
  const state = signOauthState(env, NOW);
  const res = response();
  await cb({
    method: 'GET',
    url: `/api/studio/youtube-callback?code=abc&state=${encodeURIComponent(state)}`,
    headers: { cookie: sessionCookie(env, issueSession(env, NOW)) },
  }, res);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, '/video/studio?youtube=connected');
  const stored = await publishStore.getYoutubeToken();
  assert.ok(stored.encrypted_payload);
  assert.doesNotMatch(stored.encrypted_payload, /1\/\/refresh|ya29/);
  assert.equal(stored.channel_title, 'Colorado News Press');
});

test('published overlay merges into the public catalog without exposing drafts', async () => {
  const overlay = {
    version: 1,
    items: [{
      id: 'genesee-evening-20260929-clip',
      title: 'Genesee evening update',
      description: 'An approved report.',
      creator: 'paul-hill',
      credit: 'Paul Hill',
      publications: ['network'],
      towns: [],
      published_at: '2026-09-29T12:00:00.000Z',
      status: 'published',
      kind: 'recorded',
      playback: { type: 'mp4', url: 'https://res.cloudinary.com/satcomtest/video/upload/satcom/published/x.mp4' },
    }],
  };
  const merged = mergeCatalogs({ version: 1, items: [] }, overlay);
  const videos = publicCatalog(merged, NOW + 1000);
  assert.equal(videos.length, 1);
  assert.equal(videos[0].id, 'genesee-evening-20260929-clip');
  const env = { VIDEO_PUBLISHED_CATALOG_URL: 'https://res.cloudinary.com/satcomtest/raw/upload/satcom-studio/published/catalog.json' };
  const result = await readCatalog({
    env,
    fetchImpl: async (url) => {
      assert.equal(String(url), env.VIDEO_PUBLISHED_CATALOG_URL);
      return Response.json(overlay);
    },
  });
  assert.equal(result.source, 'catalog+published');
  assert.equal(result.catalog.items[0].id, 'genesee-evening-20260929-clip');
});
