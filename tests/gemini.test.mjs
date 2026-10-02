import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VERSION, loadRegistry, resolveModel, ModelDeniedError, selectKey, KeyIsolationError,
  redact, createGeminiClient, createMemoryStore, sanitizeUsageRow, handoffContract,
  BudgetExceededError, CircuitOpenError, failClosedModel, WorkloadNotServedError,
} from '../packages/satcom-gemini/index.js';
import { createStudioHandler } from '../lib/video-studio/handler.js';
import { existsSync } from 'node:fs';

const PASSWORD = 'correct horse battery staple';
const CLOUD = { CLOUDINARY_URL: 'cloudinary://111222333:cloud-secret-value@satcomtest' };
const NOW = Date.parse('2026-09-29T20:00:00Z');
const VIDEO_KEY = 'AIzaSyVideoKeyOnlyxxxxxxxxxxxVIDEO';
const COPY_KEY = 'AIzaSyCopyKeyOnlyxxxxxxxxxxxxxCOPY';
const HEALTH_KEY = 'AIzaSyHealthKeyOnlyxxxxxxxxxxHLTH';
const FALLBACK_KEY = 'AIzaSyFallbackKeyOnlyxxxxxxxFALL';

const jsonResponse = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function response() {
  return { headers: {}, statusCode: 0, body: undefined, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = v; }, get json() { return JSON.parse(this.body); } };
}

test('package version matches VERSION file and registry', () => {
  assert.equal(VERSION, '0.2.0');
  assert.equal(VERSION, readFileSync(new URL('../packages/satcom-gemini/VERSION', import.meta.url), 'utf8').trim());
  assert.equal(loadRegistry().version, VERSION);
});

test('Python twin and Omni queue files are gone', () => {
  assert.equal(existsSync(new URL('../packages/satcom-gemini/python/satcom_gemini.py', import.meta.url)), false);
  assert.equal(existsSync(new URL('../packages/satcom-gemini/omni.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../packages/satcom-gemini/jobs.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../api/gemini/poll.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../lib/gemini-poll.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../supabase/migrations/20260929120200_video_jobs.sql', import.meta.url)), false);
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(vercel.crons, undefined);
});

test('key selection uses GEMINI_KEY_* with no GEMINI_API_KEY fallback', () => {
  const registry = loadRegistry();
  const env = { GEMINI_KEY_VIDEO: VIDEO_KEY, GEMINI_KEY_COPY: COPY_KEY, GEMINI_KEY_HEALTH: HEALTH_KEY, GEMINI_API_KEY: FALLBACK_KEY };
  assert.equal(selectKey(env, registry, 'video').source, 'GEMINI_KEY_VIDEO');
  assert.equal(selectKey(env, registry, 'copy').source, 'GEMINI_KEY_COPY');
  assert.equal(selectKey(env, registry, 'health').source, 'GEMINI_KEY_HEALTH');
  assert.equal(selectKey(env, registry, 'video').key, VIDEO_KEY);
  assert.notEqual(selectKey(env, registry, 'copy').key, VIDEO_KEY);
  assert.notEqual(selectKey(env, registry, 'health').key, VIDEO_KEY);
  assert.notEqual(selectKey(env, registry, 'health').key, COPY_KEY);
  assert.throws(() => selectKey({ GEMINI_KEY_VIDEO: VIDEO_KEY, GEMINI_API_KEY: FALLBACK_KEY }, registry, 'health'), KeyIsolationError);
  assert.throws(() => selectKey({ GEMINI_KEY_HEALTH: HEALTH_KEY }, registry, 'video'), KeyIsolationError);
  assert.throws(() => selectKey({ GEMINI_KEY_HEALTH: HEALTH_KEY }, registry, 'copy'), KeyIsolationError);
  assert.throws(() => selectKey({ GEMINI_API_KEY: FALLBACK_KEY }, registry, 'copy'), KeyIsolationError);
  assert.throws(() => selectKey({ GEMINI_API_KEY_COPY: COPY_KEY }, registry, 'copy'), KeyIsolationError);
});

test('fail-closed model ids: pin Omni 1.1, deny preview, reject unknown and implicit Veo', () => {
  const registry = loadRegistry();
  assert.equal(failClosedModel(registry, 'video'), 'gemini-omni-1.1-flash');
  assert.equal(failClosedModel(registry, 'copy'), 'gemini-3.5-flash');
  assert.throws(() => resolveModel(registry, 'video', 'gemini-omni-flash-preview'), ModelDeniedError);
  assert.throws(() => resolveModel(registry, 'video', 'gemini-not-a-real-model'), ModelDeniedError);
  assert.throws(() => resolveModel(registry, 'copy', 'gemini-flash-latest'), ModelDeniedError);
  assert.equal(resolveModel(registry, 'video', 'veo-3.1-generate-preview').optional, true);
  assert.equal(resolveModel(registry, 'video').optional, false);
});

test('this Vercel module refuses Omni generateContent', async () => {
  const client = createGeminiClient({
    env: { GEMINI_KEY_VIDEO: VIDEO_KEY, GEMINI_KEY_COPY: COPY_KEY },
    store: createMemoryStore(), clock: () => NOW, sleep: async () => {},
    fetchImpl: async () => { throw new Error('Gemini must not be called for video'); },
  });
  await assert.rejects(() => client.generateContent({ workload: 'video', parts: [{ text: 'clip' }] }), WorkloadNotServedError);
});

test('retries only on 429/5xx with backoff, and redacts keys', async () => {
  const waits = [];
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), key: options.headers['x-goog-api-key'] });
    if (calls.length < 3) return jsonResponse({ error: { message: `bad ${COPY_KEY}` } }, 429, { 'retry-after': '1' });
    return jsonResponse({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2 } });
  };
  const client = createGeminiClient({
    env: { GEMINI_KEY_COPY: COPY_KEY },
    fetchImpl,
    store: createMemoryStore(),
    clock: () => NOW,
    sleep: async ms => { waits.push(ms); },
  });
  const out = await client.generateContent({ workload: 'copy', parts: [{ text: 'hello' }] });
  assert.equal(out.model, 'gemini-3.5-flash');
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [1000, 1000]);
  assert.ok(calls.every(c => c.key === COPY_KEY));
  const failing = createGeminiClient({
    env: { GEMINI_KEY_COPY: COPY_KEY },
    fetchImpl: async () => jsonResponse({ error: `leaked ${COPY_KEY}` }, 400),
    store: createMemoryStore(), clock: () => NOW, sleep: async () => {},
  });
  await assert.rejects(() => failing.generateContent({ workload: 'copy', parts: [{ text: 'x' }] }), err => {
    assert.doesNotMatch(err.message + (err.body || ''), new RegExp(COPY_KEY));
    assert.match(err.message + (err.body || ''), /\*\*\*/);
    return err.status === 502;
  });
});

test('circuit breaker is per-workload so copy cannot open health', async () => {
  const registry = structuredClone(loadRegistry());
  registry.workloads.copy.circuit.failureThreshold = 2;
  registry.retry.maxRetries = 0;
  const store = createMemoryStore();
  let copyCalls = 0, healthCalls = 0;
  const copy = createGeminiClient({
    env: { GEMINI_KEY_COPY: COPY_KEY, GEMINI_KEY_HEALTH: HEALTH_KEY },
    registry, store, clock: () => NOW, sleep: async () => {},
    fetchImpl: async () => { copyCalls += 1; return jsonResponse({}, 500); },
  });
  await assert.rejects(() => copy.generateContent({ workload: 'copy', parts: [{ text: 'a' }] }));
  await assert.rejects(() => copy.generateContent({ workload: 'copy', parts: [{ text: 'b' }] }));
  await assert.rejects(() => copy.generateContent({ workload: 'copy', parts: [{ text: 'c' }] }), CircuitOpenError);
  const health = createGeminiClient({
    env: { GEMINI_KEY_COPY: COPY_KEY, GEMINI_KEY_HEALTH: HEALTH_KEY },
    registry, store, clock: () => NOW, sleep: async () => {},
    fetchImpl: async () => {
      healthCalls += 1;
      return jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    },
  });
  const ok = await health.generateContent({ workload: 'health', parts: [{ text: 'symptom check' }] });
  assert.equal(ok.text, 'ok');
  assert.equal(copyCalls, 2);
  assert.equal(healthCalls, 1);
});

test('budget cap blocks a workload without charging the others', async () => {
  const store = createMemoryStore();
  await store.insertUsage({ workload: 'copy', model: 'gemini-3.5-flash', estimated_usd: 20, status: 'ok', created_at_ms: NOW - 1000 });
  const copy = createGeminiClient({
    env: { GEMINI_KEY_COPY: COPY_KEY, GEMINI_KEY_HEALTH: HEALTH_KEY },
    store, clock: () => NOW, sleep: async () => {},
    fetchImpl: async () => { throw new Error('Gemini must not be called after the budget cap'); },
  });
  await assert.rejects(() => copy.generateContent({ workload: 'copy', parts: [{ text: 'title' }] }), BudgetExceededError);
  const health = createGeminiClient({
    env: { GEMINI_KEY_HEALTH: HEALTH_KEY },
    store, clock: () => NOW, sleep: async () => {},
    fetchImpl: async () => jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }),
  });
  const out = await health.generateContent({ workload: 'health', parts: [{ text: 'check' }] });
  assert.equal(out.text, 'ok');
});

test('health usage log holds counts and dollars only — never prompt or response text', async () => {
  const store = createMemoryStore();
  const secret = 'patient reports chest pain and takes lisinopril';
  const client = createGeminiClient({
    env: { GEMINI_KEY_HEALTH: HEALTH_KEY },
    store, clock: () => NOW, sleep: async () => {},
    fetchImpl: async (_url, options) => {
      assert.match(options.body, /chest pain/);
      assert.equal(JSON.parse(options.body).contents[0].parts[0].text, secret);
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: 'Possible angina. Seek care.' }] } }],
        usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 12, totalTokenCount: 52 },
      });
    },
  });
  await client.generateContent({ workload: 'health', parts: [{ text: secret }] });
  const row = store._usage[0];
  const dumped = JSON.stringify(row);
  assert.equal(row.workload, 'health');
  assert.equal(row.input_tokens, 40);
  assert.ok(row.estimated_usd > 0);
  assert.doesNotMatch(dumped, /chest pain|lisinopril|angina|Possible/);
  assert.deepEqual(row.metadata, {});
  const sneaky = sanitizeUsageRow({
    workload: 'health', model: 'gemini-3.5-flash', status: 'ok',
    metadata: { prompt: secret, response: 'do not store', input_tokens: 1 },
  }, { noPhi: true });
  assert.doesNotMatch(JSON.stringify(sneaky), /chest pain|do not store/);
});

test('handoff contract pins folder, tags and sidecar fields for Patrick\'s queue', () => {
  const handoff = handoffContract();
  assert.equal(handoff.cloudinaryFolder, 'satcom/generated');
  assert.equal(handoff.originalsFolder, 'satcom/paul-hill/originals');
  assert.equal(handoff.type, 'private');
  assert.equal(handoff.published, false);
  assert.ok(handoff.videoTags.includes('satcom-generated'));
  assert.deepEqual(handoff.sidecarFields, ['model', 'prompt', 'resolution', 'duration', 'aspect', 'timestamp', 'synthid_note']);
  assert.match(handoff.synthidNote, /SynthID/);
});

test('Video Studio Gemini assist uses GEMINI_KEY_COPY', async () => {
  const env = { VIDEO_STUDIO_PASSWORD: PASSWORD, GEMINI_KEY_COPY: COPY_KEY, GEMINI_KEY_VIDEO: VIDEO_KEY, ...CLOUD };
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const u = String(url); calls.push(u);
    if (u.includes('generativelanguage.googleapis.com')) {
      assert.equal(options.headers['x-goog-api-key'], COPY_KEY);
      assert.match(u, /gemini-3.5-flash:generateContent/);
      return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({ titles: ['Town meeting'], description: 'd', social: { x: 'post' }, hashtags: ['Idaho'] }) }] } }] });
    }
    if (u.includes('res.cloudinary.com')) return new Response(Buffer.from('media'), { status: 200 });
    throw new Error('unexpected ' + u);
  };
  const handler = createStudioHandler({ getEnv: () => env, fetchImpl, clock: () => NOW, store: createMemoryStore(), sleep: async () => {} });
  const res = response();
  await handler({ method: 'POST', url: '/api/studio', body: { op: 'login', password: PASSWORD }, headers: { 'x-studio-request': '1', 'x-forwarded-for': '198.51.100.40' } }, res);
  const cookie = res.headers['Set-Cookie'].split(';')[0];
  const assist = response();
  await handler({
    method: 'POST', url: '/api/studio', cookie,
    headers: { 'x-studio-request': '1', cookie, 'x-forwarded-for': '198.51.100.40' },
    body: { op: 'assist', provider: 'gemini', source: { public_id: 'satcom-studio/sources/clip', type: 'authenticated', duration: 42 }, edit: { start: 0, end: 12 } },
  }, assist);
  assert.equal(assist.statusCode, 200, assist.body);
  assert.equal(assist.json.provider, 'gemini');
  assert.equal(assist.json.model, 'gemini-3.5-flash');
  assert.doesNotMatch(assist.body, new RegExp(COPY_KEY + '|' + VIDEO_KEY));
  assert.ok(calls.some(c => c.includes('generateContent')));
});

test('Studio lists and opens private generated clips under satcom/generated/', async () => {
  const env = { VIDEO_STUDIO_PASSWORD: PASSWORD, ...CLOUD };
  const sidecar = {
    model: 'gemini-omni-1.1-flash',
    prompt: 'Genesee evening update',
    resolution: '1080p',
    duration: 8,
    aspect: '16:9',
    timestamp: '2026-09-29T20:00:00.000Z',
    synthid_note: 'This video was generated by Google Gemini Omni Flash. SynthID watermark.',
  };
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/resources/search')) {
      return jsonResponse({
        resources: [{
          public_id: 'satcom/generated/genesee-evening',
          type: 'private',
          created_at: '2026-09-29T20:00:00Z',
          width: 1920, height: 1080, duration: 8, bytes: 1200,
          context: { caption: 'Genesee evening update' },
          tags: ['satcom-generated', 'ai-generated', 'gemini-omni', 'draft'],
        }],
      });
    }
    if (u.includes('/raw/download') && u.includes('genesee-evening-sidecar')) {
      return new Response(JSON.stringify(sidecar), { status: 200 });
    }
    throw new Error('unexpected ' + u);
  };
  const handler = createStudioHandler({ getEnv: () => env, fetchImpl, clock: () => NOW, store: createMemoryStore(), sleep: async () => {} });
  const login = response();
  await handler({ method: 'POST', url: '/api/studio', body: { op: 'login', password: PASSWORD }, headers: { 'x-studio-request': '1', 'x-forwarded-for': '198.51.100.41' } }, login);
  const cookie = login.headers['Set-Cookie'].split(';')[0];
  const list = response();
  await handler({
    method: 'POST', url: '/api/studio',
    headers: { 'x-studio-request': '1', cookie, 'x-forwarded-for': '198.51.100.41' },
    body: { op: 'generated-list' },
  }, list);
  assert.equal(list.statusCode, 200, list.body);
  assert.equal(list.json.items[0].public_id, 'satcom/generated/genesee-evening');
  assert.equal(list.json.items[0].type, 'private');
  assert.equal(list.json.published, false);
  assert.match(list.json.items[0].preview_url, /\/video\/private\//);
  const opened = response();
  await handler({
    method: 'POST', url: '/api/studio',
    headers: { 'x-studio-request': '1', cookie, 'x-forwarded-for': '198.51.100.41' },
    body: { op: 'generated-get', public_id: 'satcom/generated/genesee-evening' },
  }, opened);
  assert.equal(opened.statusCode, 200, opened.body);
  assert.equal(opened.json.sidecar.model, 'gemini-omni-1.1-flash');
  assert.equal(opened.json.sidecar_ok, true);
  assert.match(opened.json.sidecar.synthid_note, /SynthID/);
  const denied = response();
  await handler({
    method: 'POST', url: '/api/studio',
    headers: { 'x-studio-request': '1', cookie, 'x-forwarded-for': '198.51.100.41' },
    body: { op: 'generated-get', public_id: 'satcom-studio/sources/clip' },
  }, denied);
  assert.equal(denied.statusCode, 400);
});

test('redact strips Gemini keys from arbitrary error strings', () => {
  const env = { GEMINI_KEY_VIDEO: VIDEO_KEY, GEMINI_API_KEY: FALLBACK_KEY };
  assert.equal(redact(`https://x?key=${VIDEO_KEY}`, env).includes(VIDEO_KEY), false);
  assert.match(redact(`x-goog-api-key: ${FALLBACK_KEY}`, env), /x-goog-api-key: \*\*\*/);
});
