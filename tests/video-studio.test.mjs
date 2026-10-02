import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioHandler } from '../lib/video-studio/handler.js';
import { deliveryUrl, layerText, apiSignature } from '../lib/video-studio/cloudinary.js';
import { editSchema, videoTransformation, imageTransformation, imageBrandSchema } from '../lib/video-studio/edit.js';
import { parseCaptions, toSrt, cuesForWindow, wordsToCues } from '../lib/video-studio/captions.js';
import { buildDraftEntry, draftMetaSchema } from '../lib/video-studio/drafts.js';
import { publicCatalog } from '../lib/video-feed.js';

const PASSWORD = 'correct horse battery staple';
const CLOUD = { CLOUDINARY_URL: 'cloudinary://111222333:cloud-secret-value@satcomtest' };
const NOW = Date.parse('2026-09-28T20:00:00Z');

function response() {
  return { headers: {}, statusCode: 0, body: undefined, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = v; }, get json() { return JSON.parse(this.body); } };
}
function handlerWith(env, fetchImpl = async () => { throw new Error('unexpected fetch'); }) {
  return createStudioHandler({ getEnv: () => env, fetchImpl, clock: () => NOW });
}
async function call(handler, { method = 'POST', body, cookie, header = true, ip = '203.0.113.9' } = {}) {
  const res = response();
  await handler({ method, url: '/api/studio', body, headers: { ...(header ? { 'x-studio-request': '1' } : {}), ...(cookie ? { cookie } : {}), 'x-forwarded-for': ip } }, res);
  return res;
}
async function login(handler, ip) {
  const res = await call(handler, { body: { op: 'login', password: PASSWORD }, ip });
  assert.equal(res.statusCode, 200);
  return res.headers['Set-Cookie'].split(';')[0];
}
const source = { public_id: 'satcom-studio/sources/clip', type: 'authenticated', duration: 42 };

test('studio is disabled by default and refuses every operation', async () => {
  for (const env of [{}, { VIDEO_STUDIO_PASSWORD: 'short' }]) {
    const handler = handlerWith(env);
    const status = await call(handler, { method: 'GET' });
    assert.equal(status.json.enabled, false);
    const op = await call(handler, { body: { op: 'login', password: 'short' } });
    assert.equal(op.statusCode, 404);
  }
});

test('password gate, secure session cookie and CSRF header are enforced', async () => {
  const env = { VIDEO_STUDIO_PASSWORD: PASSWORD, VERCEL: '1', ...CLOUD };
  const handler = handlerWith(env);
  assert.equal((await call(handler, { body: { op: 'login', password: 'wrong password here' }, ip: '198.51.100.1' })).statusCode, 401);
  assert.equal((await call(handler, { body: { op: 'render', source } })).statusCode, 401);
  assert.equal((await call(handler, { body: { op: 'login', password: PASSWORD }, header: false })).statusCode, 403);
  const res = await call(handler, { body: { op: 'login', password: PASSWORD }, ip: '198.51.100.2' });
  const setCookie = res.headers['Set-Cookie'];
  assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Lax/); assert.match(setCookie, /Secure/); assert.match(setCookie, /Path=\/api\/studio/);
  const cookie = setCookie.split(';')[0];
  const status = await call(handler, { method: 'GET', cookie });
  assert.equal(status.json.authenticated, true);
  assert.equal(status.json.features.cloudinary, true);
  assert.equal(status.json.features.grok, false);
  assert.doesNotMatch(status.body, /cloud-secret-value|111222333|correct horse/);
  const tampered = cookie.slice(0, -2) + 'xx';
  assert.equal((await call(handler, { body: { op: 'render', source }, cookie: tampered })).statusCode, 401);
  // A password change invalidates existing sessions.
  const rotated = handlerWith({ ...env, VIDEO_STUDIO_PASSWORD: 'another long password' });
  assert.equal((await call(rotated, { body: { op: 'render', source }, cookie })).statusCode, 401);
});

test('AI and image features are disabled with a note when keys are missing', async () => {
  const handler = handlerWith({ VIDEO_STUDIO_PASSWORD: PASSWORD, ...CLOUD });
  const cookie = await login(handler, '198.51.100.3');
  const status = (await call(handler, { method: 'GET', cookie })).json;
  assert.ok(status.notes.some(n => n.includes('XAI_API_KEY')));
  assert.ok(status.notes.some(n => n.includes('GEMINI_KEY_COPY')));
  for (const body of [{ op: 'assist', provider: 'grok', source }, { op: 'transcribe', source }, { op: 'image-generate', prompt: 'A mountain town' }]) {
    const res = await call(handler, { body, cookie });
    assert.equal(res.statusCode, 503);
    assert.match(res.json.error, /XAI_API_KEY|GEMINI_KEY_COPY|AI/);
  }
});

test('render builds signed Cloudinary URLs for trim, social crop, captions and brand overlays', async () => {
  const uploads = [];
  const fetchImpl = async (url, options) => {
    uploads.push({ url: String(url), form: options.body });
    return new Response(JSON.stringify({ public_id: options.body.get('public_id') }), { status: 200 });
  };
  const handler = handlerWith({ VIDEO_STUDIO_PASSWORD: PASSWORD, ...CLOUD }, fetchImpl);
  const cookie = await login(handler, '198.51.100.4');
  const res = await call(handler, { cookie, body: { op: 'render', source,
    edit: { start: 5, end: 20, formats: ['9:16', '1:1', '16:9'], brand: { preset: 'the-villager', lower_name: 'Paul Hill, reporting' }, captions: { enabled: true } },
    cues: [{ start: 6, end: 8, text: 'Hello, Idaho Springs' }, { start: 30, end: 31, text: 'outside window' }] } });
  assert.equal(res.statusCode, 200, res.body);
  const { outputs } = res.json;
  assert.deepEqual(outputs.map(o => o.format), ['9:16', '1:1', '16:9']);
  const vertical = outputs[0];
  assert.match(vertical.mp4_url, /^https:\/\/res\.cloudinary\.com\/satcomtest\/video\/authenticated\/s--[A-Za-z0-9_-]{8}--\/so_5,eo_20\/c_fill,ar_9:16,w_1080,g_center\//);
  assert.match(vertical.mp4_url, /l_subtitles:Arial_\d+_bold:satcom-studio:captions:[a-f0-9]{20}\.srt/);
  assert.match(vertical.mp4_url, /THE%20VILLAGER/);
  assert.match(vertical.mp4_url, /Paul%20Hill%252C%20reporting/);
  assert.match(vertical.download_url, /fl_attachment:the-villager-9x16-20260928\/satcom-studio\/sources\/clip\.mp4$/);
  assert.match(vertical.poster_url, /\.jpg$/);
  assert.doesNotMatch(res.body, /cloud-secret-value/);
  // Captions are shifted into the trimmed timeline and cues outside it are dropped.
  const srtUpload = uploads.find(u => u.url.endsWith('/raw/upload'));
  const srt = await srtUpload.form.get('file').text();
  assert.match(srt, /00:00:01,000 --> 00:00:03,000\nHello, Idaho Springs/);
  assert.doesNotMatch(srt, /outside window/);
  assert.match(srtUpload.form.get('signature'), /^[a-f0-9]{40}$/);
});

test('private generated sources under satcom/generated/ can be opened as studio clips', async () => {
  const handler = handlerWith({ VIDEO_STUDIO_PASSWORD: PASSWORD, ...CLOUD });
  const cookie = await login(handler, '198.51.100.8');
  const res = await call(handler, { cookie, body: { op: 'render', source: { public_id: 'satcom/generated/clip', type: 'private', duration: 8 }, edit: { start: 0, end: 8, formats: ['16:9'] } } });
  assert.equal(res.statusCode, 200, res.body);
  assert.match(res.json.outputs[0].mp4_url, /\/video\/private\//);
  assert.doesNotMatch(res.body, /cloud-secret-value/);
});

test('private creator uploads under satcom/paul-hill/incoming can be opened as studio clips', async () => {
  const handler = handlerWith({ VIDEO_STUDIO_PASSWORD: PASSWORD, ...CLOUD });
  const cookie = await login(handler, '198.51.100.18');
  const res = await call(handler, { cookie, body: { op: 'render', source: { public_id: 'satcom/paul-hill/incoming/idaho-morning', type: 'private', duration: 12 }, edit: { start: 0, end: 8, formats: ['9:16'] } } });
  assert.equal(res.statusCode, 200, res.body);
  assert.match(res.json.outputs[0].mp4_url, /\/video\/private\//);
  assert.doesNotMatch(res.body, /cloud-secret-value/);
});

test('invalid inputs fail closed', async () => {
  const handler = handlerWith({ VIDEO_STUDIO_PASSWORD: PASSWORD, ...CLOUD });
  const cookie = await login(handler, '198.51.100.5');
  for (const bad of [
    { op: 'render', source: { public_id: '../etc/passwd', type: 'upload' } },
    { op: 'render', source: { public_id: 'ok', type: 'private' } },
    { op: 'render', source: { public_id: 'satcom/generated/clip', type: 'private' }, edit: { start: 30, end: 10 } },
    { op: 'render', source: { ...source }, edit: { start: 30, end: 10 } },
    { op: 'render', source, edit: { formats: ['4:3'] } },
    { op: 'nope' },
  ]) assert.equal((await call(handler, { cookie, body: bad })).statusCode, 400, JSON.stringify(bad));
});

test('delivery signature and text escaping follow Cloudinary rules', () => {
  const url = deliveryUrl({ cloudName: 'demo', apiSecret: 'abcdSECRET' }, { resourceType: 'video', type: 'authenticated', publicId: 'folder/clip', ext: 'mp4',
    transformation: 'so_2,eo_10/c_fill,ar_9:16,w_1080,g_auto/l_text:Arial_40_bold:Hello%252C%20World,co_white/fl_layer_apply,g_south_west,x_40,y_120' });
  // Matches the official Cloudinary Node SDK output for the same input.
  assert.match(url, /\/s--iJzYbSzp--\//);
  assert.equal(layerText('A, B/C'), 'A%252C%20B%252FC');
  assert.equal(apiSignature({ timestamp: 1, folder: 'a' }, 's'), apiSignature({ folder: 'a', timestamp: 1 }, 's'));
});

test('image branding covers all title presets and social sizes', () => {
  for (const preset of ['satcom', 'colorado-news-press', 'the-villager', 'register-call']) {
    const spec = imageBrandSchema.parse({ formats: ['1:1', '4:5', '9:16', '16:9', '1.91:1'], headline: 'Rodeo returns', brand: { preset } });
    for (const f of spec.formats) assert.match(imageTransformation(spec, f).transformation, /^c_fill,ar_[\d.:]+,w_\d+,g_auto\/l_text:Georgia/);
  }
  const edit = editSchema.parse({ brand: { preset: 'register-call', bug: 'logo' } });
  assert.match(videoTransformation(edit, { ...source, type: 'upload' }, '16:9').transformation, /l_satcom-studio:brand:register-call\/c_scale,w_220\/fl_layer_apply,g_north_east/);
});

test('captions parse, shift and group correctly', () => {
  const cues = parseCaptions('WEBVTT\n\n00:00:01.500 --> 00:00:03.000\nFirst line\n\n00:01:00,000 --> 00:01:02,000\nSecond');
  assert.deepEqual(cues.map(c => c.start), [1.5, 60]);
  assert.match(toSrt(cues), /^1\n00:00:01,500 --> 00:00:03,000\nFirst line/);
  assert.deepEqual(cuesForWindow(cues, 59, 61), [{ start: 1, end: 2, text: 'Second' }]);
  const grouped = wordsToCues([{ text: 'Hello', start: 0, end: 0.4 }, { text: 'there.', start: 0.5, end: 0.9 }, { text: 'Next', start: 3, end: 3.4 }], 10);
  assert.deepEqual(grouped.map(c => [c.start, c.text]), [[10, 'Hello there.'], [13, 'Next']]);
});

test('studio drafts are never exposed by the public feed', () => {
  const meta = draftMetaSchema.parse({ title: 'Rodeo Day in Idaho Springs', publications: ['weekly-register-call'] });
  const { entry, ready_to_publish } = buildDraftEntry({ meta, now: NOW, playbackUrl: 'https://res.cloudinary.com/x/video/upload/a.mp4', posterUrl: 'https://res.cloudinary.com/x/video/upload/a.jpg',
    brand: 'register-call', format: '9:16', source: { public_id: 'a', type: 'upload' }, window: { start: 0, end: 15 } });
  assert.equal(entry.status, 'draft'); assert.equal(entry.published, false); assert.equal(ready_to_publish, true);
  assert.match(entry.id, /^rodeo-day-in-idaho-springs-202609282000$/);
  const catalog = { version: 1, items: [entry, { ...entry, id: 'flagged', status: 'published', published: false }] };
  assert.deepEqual(publicCatalog(catalog, NOW + 1000), []);
});

test('Grok assist and Grok Imagine responses are normalised and stored without leaking keys', async () => {
  const env = { VIDEO_STUDIO_PASSWORD: PASSWORD, XAI_API_KEY: 'xai-secret-key', ...CLOUD };
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const u = String(url); calls.push(u);
    if (u === 'https://api.x.ai/v1/chat/completions') {
      const sent = JSON.parse(options.body);
      assert.equal(sent.messages[0].content.filter(p => p.type === 'image_url').length, 6);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ titles: ['Rodeo returns'], description: 'd', social: { x: 'post', tiktok: 't' }, hashtags: ['#Rodeo'], highlight: { start: 2, end: 99, reason: 'crowd' } }) } }] });
    }
    if (u === 'https://api.x.ai/v1/images/generations') return Response.json({ data: [{ b64_json: Buffer.from('img').toString('base64'), mime_type: 'image/png' }] });
    if (u.endsWith('/image/upload')) return Response.json({ public_id: 'satcom-studio/images/abc', type: 'upload', width: 1024, height: 1024 });
    throw new Error('unexpected ' + u);
  };
  const handler = handlerWith(env, fetchImpl);
  const cookie = await login(handler, '198.51.100.6');
  const assist = await call(handler, { cookie, body: { op: 'assist', provider: 'grok', source, edit: { start: 10, end: 40 } } });
  assert.equal(assist.statusCode, 200, assist.body);
  assert.deepEqual(assist.json.highlight, { start: 12, end: 40, reason: 'crowd' });
  assert.deepEqual(assist.json.hashtags, ['Rodeo']);
  const image = await call(handler, { cookie, body: { op: 'image-generate', prompt: 'Main street at dusk', aspect_ratio: '16:9', brand: 'satcom', brand_style: true } });
  assert.equal(image.statusCode, 200, image.body);
  assert.equal(image.json.images[0].public_id, 'satcom-studio/images/abc');
  assert.doesNotMatch(assist.body + image.body, /xai-secret-key|cloud-secret-value/);
  const failing = handlerWith(env, async () => new Response('{"error":"xai-secret-key invalid"}', { status: 401 }));
  const failCookie = await login(failing, '198.51.100.7');
  const failed = await call(failing, { cookie: failCookie, body: { op: 'image-generate', prompt: 'Main street at dusk' } });
  assert.equal(failed.statusCode, 502); assert.doesNotMatch(failed.body, /xai-secret-key/);
});
