import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCreatorUploadHandler } from '../lib/creator-upload/handler.js';
import { parseCreatorTokens, matchEnvToken, hashToken, incomingPublicId, generateToken } from '../lib/creator-upload/tokens.js';
import { isAllowedVideo, MAX_FILE_BYTES } from '../lib/creator-upload/limits.js';
import { incomingFolder, isIncomingPublicId } from '../lib/video-studio/incoming.js';
import { apiSignature } from '../lib/video-studio/cloudinary.js';
import { createStudioHandler } from '../lib/video-studio/handler.js';

const TOKEN = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);
const CREATOR_LINE = `paul-hill|Paul Hill|${TOKEN}`;
const CLOUD = { CLOUDINARY_URL: 'cloudinary://111222333:cloud-secret-value@satcomtest' };
const NOW = Date.parse('2026-10-01T12:00:00Z');
const PASSWORD = 'correct horse battery staple';

function response() {
  return { headers: {}, statusCode: 0, body: undefined, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = v; }, get json() { return JSON.parse(this.body); } };
}

function handlerWith(env, fetchImpl = async () => { throw new Error('unexpected fetch'); }) {
  return createCreatorUploadHandler({ getEnv: () => env, fetchImpl, clock: () => NOW, sleep: async () => {} });
}

async function call(handler, { method = 'POST', body, header = true, ip = '203.0.113.20' } = {}) {
  const res = response();
  await handler({
    method, url: '/api/creator-upload', body,
    headers: { ...(header ? { 'x-creator-upload': '1' } : {}), 'x-forwarded-for': ip },
  }, res);
  return res;
}

test('token list defaults to empty and accepts line or JSON env without leaking values', () => {
  assert.deepEqual(parseCreatorTokens(''), []);
  assert.deepEqual(parseCreatorTokens('   '), []);
  assert.equal(matchEnvToken({}, TOKEN), null);
  const line = parseCreatorTokens(CREATOR_LINE);
  assert.equal(line[0].slug, 'paul-hill');
  assert.equal(line[0].name, 'Paul Hill');
  assert.equal(line[0].token_hash, hashToken(TOKEN));
  const json = parseCreatorTokens(JSON.stringify([{ slug: 'paul-hill', name: 'Paul Hill', token: TOKEN }]));
  assert.equal(json[0].name, 'Paul Hill');
  assert.equal(matchEnvToken({ CREATOR_UPLOAD_TOKENS: CREATOR_LINE }, TOKEN).slug, 'paul-hill');
  assert.equal(matchEnvToken({ CREATOR_UPLOAD_TOKENS: CREATOR_LINE }, OTHER), null);
  assert.equal(matchEnvToken({ CREATOR_UPLOAD_TOKENS: CREATOR_LINE }, 'short-token'), null);
  assert.match(generateToken(), /^[a-f0-9]{64}$/);
});

test('incoming public ids stay under the creator folder', () => {
  assert.equal(incomingFolder('paul-hill'), 'satcom/paul-hill/incoming');
  const id = incomingPublicId('paul-hill', 'Idaho morning', NOW, 'abcd12');
  assert.equal(id, 'satcom/paul-hill/incoming/idaho-morning-202610011200-abcd12');
  assert.equal(isIncomingPublicId(id), true);
  assert.equal(isIncomingPublicId('satcom/paul-hill/originals/clip'), false);
  assert.equal(isIncomingPublicId('satcom/generated/clip'), false);
  assert.equal(isIncomingPublicId('satcom/paul-hill/incoming/../escape'), false);
});

test('only sane video types and sizes are accepted', () => {
  assert.equal(isAllowedVideo({ filename: 'clip.mp4', mime: 'video/mp4', bytes: 12_000 }), true);
  assert.equal(isAllowedVideo({ filename: 'clip.MOV', mime: 'video/quicktime', bytes: 80_000_000 }), true);
  assert.equal(isAllowedVideo({ filename: 'notes.pdf', mime: 'application/pdf', bytes: 1000 }), false);
  assert.equal(isAllowedVideo({ filename: 'clip.mp4', mime: 'video/mp4', bytes: MAX_FILE_BYTES + 1 }), false);
  assert.equal(isAllowedVideo({ filename: 'clip.mp4', mime: 'video/mp4', bytes: 0 }), false);
});

test('missing, short, and unknown tokens are a polite dead end that reveals nothing', async () => {
  const handler = handlerWith({ CREATOR_UPLOAD_TOKENS: CREATOR_LINE, ...CLOUD });
  for (const body of [
    { op: 'session' },
    { op: 'session', token: 'nope' },
    { op: 'session', token: OTHER },
    { op: 'sign', token: OTHER, filename: 'a.mp4', mime: 'video/mp4', bytes: 1000 },
  ]) {
    const res = await call(handler, { body });
    assert.equal(res.statusCode, 404, JSON.stringify(body));
    assert.equal(res.json.error, 'This link is not available.');
    assert.doesNotMatch(res.body, /Paul Hill|paul-hill|incoming|cloud-secret|111222333|satcomtest/);
  }
  assert.equal((await call(handler, { method: 'GET', body: { op: 'session', token: TOKEN } })).statusCode, 404);
  assert.equal((await call(handler, { body: { op: 'session', token: TOKEN }, header: false })).statusCode, 404);
});

test('a valid token returns only the creator label', async () => {
  const handler = handlerWith({ CREATOR_UPLOAD_TOKENS: CREATOR_LINE, ...CLOUD });
  const res = await call(handler, { body: { op: 'session', token: TOKEN } });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(res.json, { ok: true, creator: 'Paul Hill' });
  assert.doesNotMatch(res.body, new RegExp(TOKEN));
});

test('sign locks folder, private type, draft tags and context; bytes never go through the function', async () => {
  const handler = handlerWith({ CREATOR_UPLOAD_TOKENS: CREATOR_LINE, ...CLOUD });
  const res = await call(handler, {
    body: { op: 'sign', token: TOKEN, filename: 'Idaho.mov', mime: 'video/quicktime', bytes: 2_000_000, title: 'Idaho morning', note: 'Main street' },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json.resource_type, 'video');
  assert.equal(res.json.upload_url, 'https://api.cloudinary.com/v1_1/satcomtest/video/upload');
  assert.equal(res.json.folder, 'satcom/paul-hill/incoming');
  assert.match(res.json.params.public_id, /^satcom\/paul-hill\/incoming\/idaho-morning-/);
  assert.equal(res.json.params.type, 'private');
  assert.equal(res.json.params.overwrite, 'false');
  assert.equal(res.json.params.tags, 'draft,creator-upload');
  assert.match(res.json.params.context, /creator=Paul Hill/);
  assert.match(res.json.params.context, /note=Main street/);
  assert.match(res.json.params.context, /uploaded_at=2026-10-01T12:00:00.000Z/);
  assert.match(res.json.params.context, /caption=Idaho morning/);
  const expected = apiSignature({ ...res.json.params, timestamp: res.json.timestamp }, 'cloud-secret-value');
  assert.equal(res.json.signature, expected);
  assert.equal(res.json.apiKey, '111222333');
  assert.doesNotMatch(res.body, /cloud-secret-value/);
  assert.doesNotMatch(res.body, new RegExp(TOKEN));
});

test('sign rejects non-video files and missing Cloudinary without leaking configuration details to strangers', async () => {
  const signedIn = handlerWith({ CREATOR_UPLOAD_TOKENS: CREATOR_LINE, ...CLOUD });
  const bad = await call(signedIn, { body: { op: 'sign', token: TOKEN, filename: 'notes.pdf', mime: 'application/pdf', bytes: 1000 } });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json.error, /MP4|MOV|video/i);
  const noCloud = handlerWith({ CREATOR_UPLOAD_TOKENS: CREATOR_LINE });
  const down = await call(noCloud, { body: { op: 'sign', token: TOKEN, filename: 'a.mp4', mime: 'video/mp4', bytes: 1000 } });
  assert.equal(down.statusCode, 503);
  const stranger = handlerWith({});
  const hidden = await call(stranger, { body: { op: 'sign', token: TOKEN, filename: 'a.mp4', mime: 'video/mp4', bytes: 1000 } });
  assert.equal(hidden.statusCode, 404);
  assert.equal(hidden.json.error, 'This link is not available.');
});

test('optional hashed table can grant or revoke a token without an env row', async () => {
  const hash = hashToken(TOKEN);
  const fetchImpl = async (url) => {
    assert.match(String(url), /creator_upload_tokens/);
    assert.match(String(url), new RegExp(hash));
    assert.doesNotMatch(String(url), new RegExp(TOKEN));
    return Response.json([{ creator_slug: 'paul-hill', creator_name: 'Paul Hill' }]);
  };
  const granted = handlerWith({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-test', ...CLOUD }, fetchImpl);
  const res = await call(granted, { body: { op: 'session', token: TOKEN }, ip: '198.51.100.40' });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json.creator, 'Paul Hill');
  const revoked = handlerWith({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-test', ...CLOUD }, async () => Response.json([]));
  assert.equal((await call(revoked, { body: { op: 'session', token: TOKEN }, ip: '198.51.100.41' })).statusCode, 404);
});

test('studio lists incoming creator uploads and can open them as private drafts', async () => {
  const env = { VIDEO_STUDIO_PASSWORD: PASSWORD, ...CLOUD };
  const fetchImpl = async (url) => {
    if (String(url).includes('/resources/search')) {
      return Response.json({
        resources: [{
          public_id: 'satcom/paul-hill/incoming/idaho-morning-202610011200-abcd12',
          type: 'private',
          created_at: '2026-10-01T12:00:00Z',
          width: 1080, height: 1920, duration: 14, bytes: 4000,
          context: { caption: 'Idaho morning', creator: 'Paul Hill', note: 'Main street' },
          tags: ['draft', 'creator-upload'],
        }],
      });
    }
    throw new Error('unexpected ' + url);
  };
  const studio = createStudioHandler({ getEnv: () => env, fetchImpl, clock: () => NOW });
  const login = response();
  await studio({ method: 'POST', url: '/api/studio', body: { op: 'login', password: PASSWORD }, headers: { 'x-studio-request': '1', 'x-forwarded-for': '198.51.100.50' } }, login);
  const cookie = login.headers['Set-Cookie'].split(';')[0];
  // Paul Hill's phone uploads belong to his workspace, not My properties.
  const mine = response();
  await studio({ method: 'POST', url: '/api/studio', headers: { 'x-studio-request': '1', cookie, 'x-forwarded-for': '198.51.100.50' }, body: { op: 'creator-uploads' } }, mine);
  assert.deepEqual(mine.json.items, []);
  const list = response();
  await studio({ method: 'POST', url: '/api/studio', headers: { 'x-studio-request': '1', cookie, 'x-forwarded-for': '198.51.100.50' }, body: { op: 'creator-uploads', workspace: 'paul-hill' } }, list);
  assert.equal(list.statusCode, 200, list.body);
  assert.equal(list.json.published, false);
  assert.equal(list.json.items[0].public_id, 'satcom/paul-hill/incoming/idaho-morning-202610011200-abcd12');
  assert.equal(list.json.items[0].type, 'private');
  assert.equal(list.json.items[0].creator, 'Paul Hill');
  assert.match(list.json.items[0].preview_url, /\/video\/private\//);
  const render = response();
  await studio({
    method: 'POST', url: '/api/studio',
    headers: { 'x-studio-request': '1', cookie, 'x-forwarded-for': '198.51.100.50' },
    body: { op: 'render', source: { public_id: list.json.items[0].public_id, type: 'private', duration: 14 }, edit: { start: 0, end: 8, formats: ['16:9'] } },
  }, render);
  assert.equal(render.statusCode, 200, render.body);
  assert.match(render.json.outputs[0].mp4_url, /\/video\/private\//);
});

test('rewrites add the token path without changing redirects', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(vercel.redirects.map(r => [r.source, r.destination]), [
    ['/data/video-feed.json', '/api/videos'],
    ['/', '/subscribe-villager/'],
  ]);
  assert.ok(vercel.rewrites.some(r => r.source === '/video/upload/:token' && r.destination === '/video/creator-upload'));
  assert.ok(vercel.rewrites.some(r => r.source === '/video/upload' && r.destination === '/video/creator-upload'));
  assert.ok(vercel.rewrites.some(r => r.source === '/video/studio' && r.destination === '/video/studio.html'));
  const html = readFileSync(new URL('../video/creator-upload.html', import.meta.url), 'utf8');
  assert.match(html, /Received — Patrick will review/);
  assert.match(html, /noindex/);
  assert.match(readFileSync(new URL('../video/upload.js', import.meta.url), 'utf8'), /signed\.upload_url/);
  assert.match(readFileSync(new URL('../video/upload.js', import.meta.url), 'utf8'), /X-Unique-Upload-Id/);
  assert.doesNotMatch(readFileSync(new URL('../video/upload.js', import.meta.url), 'utf8'), /VIDEO_STUDIO_PASSWORD|CLOUDINARY_URL/);
});
