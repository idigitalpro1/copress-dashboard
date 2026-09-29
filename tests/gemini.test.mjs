import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  VERSION, loadRegistry, resolveModel, ModelDeniedError, selectKey, KeyIsolationError,
  redact, createGeminiClient, createMemoryStore, sanitizeUsageRow, applyResolution,
  BudgetExceededError, CircuitOpenError, failClosedModel,
} from '../packages/satcom-gemini/index.js';
import { createStudioHandler } from '../lib/video-studio/handler.js';
import { createGeminiPollHandler } from '../lib/gemini-poll.js';

const PASSWORD = 'correct horse battery staple';
const CLOUD = { CLOUDINARY_URL: 'cloudinary://111222333:cloud-secret-value@satcomtest' };
const NOW = Date.parse('2026-09-29T20:00:00Z');
const VIDEO_KEY = 'AIzaSyVideoKeyOnlyxxxxxxxxxxxVIDEO';
const COPY_KEY = 'AIzaSyCopyKeyOnlyxxxxxxxxxxxxxCOPY';
const SUSAN_KEY = 'AIzaSySusanKeyOnlyxxxxxxxxxxxSUSAN';
const FALLBACK_KEY = 'AIzaSyFallbackKeyOnlyxxxxxxxFALL';

const jsonResponse = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function response() {
  return { headers: {}, statusCode: 0, body: undefined, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = v; }, get json() { return JSON.parse(this.body); } };
}

test('package version matches VERSION file and registry', () => {
  assert.equal(VERSION, readFileSync(new URL('../packages/satcom-gemini/VERSION', import.meta.url), 'utf8').trim());
  assert.equal(loadRegistry().version, VERSION);
});

test('key selection is isolated per workload and never crosses keys', () => {
  const registry = loadRegistry();
  const env = { GEMINI_API_KEY_VIDEO: VIDEO_KEY, GEMINI_API_KEY_COPY: COPY_KEY, GEMINI_API_KEY_SUSAN: SUSAN_KEY, GEMINI_API_KEY: FALLBACK_KEY };
  assert.equal(selectKey(env, registry, 'video').source, 'GEMINI_API_KEY_VIDEO');
  assert.equal(selectKey(env, registry, 'copy').source, 'GEMINI_API_KEY_COPY');
  assert.equal(selectKey(env, registry, 'ask_susan').source, 'GEMINI_API_KEY_SUSAN');
  assert.equal(selectKey(env, registry, 'video').key, VIDEO_KEY);
  assert.notEqual(selectKey(env, registry, 'copy').key, VIDEO_KEY);
  assert.notEqual(selectKey(env, registry, 'ask_susan').key, VIDEO_KEY);
  assert.notEqual(selectKey(env, registry, 'ask_susan').key, COPY_KEY);
  assert.throws(() => selectKey({ GEMINI_API_KEY_VIDEO: VIDEO_KEY, GEMINI_API_KEY: FALLBACK_KEY }, registry, 'ask_susan'), KeyIsolationError);
  assert.throws(() => selectKey({ GEMINI_API_KEY_SUSAN: SUSAN_KEY }, registry, 'video'), KeyIsolationError);
  assert.throws(() => selectKey({ GEMINI_API_KEY_SUSAN: SUSAN_KEY }, registry, 'copy'), KeyIsolationError);
  const fallback = selectKey({ GEMINI_API_KEY: FALLBACK_KEY }, registry, 'copy');
  assert.equal(fallback.fallback, true);
  assert.equal(fallback.source, 'GEMINI_API_KEY');
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

test('retries only on 429/5xx with backoff, and redacts keys', async () => {
  const waits = [];
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), key: options.headers['x-goog-api-key'] });
    if (calls.length < 3) return jsonResponse({ error: { message: `bad ${COPY_KEY}` } }, 429, { 'retry-after': '1' });
    return jsonResponse({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2 } });
  };
  const client = createGeminiClient({
    env: { GEMINI_API_KEY_COPY: COPY_KEY },
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
    env: { GEMINI_API_KEY_COPY: COPY_KEY },
    fetchImpl: async () => jsonResponse({ error: `leaked ${COPY_KEY}` }, 400),
    store: createMemoryStore(), clock: () => NOW, sleep: async () => {},
  });
  await assert.rejects(() => failing.generateContent({ workload: 'copy', parts: [{ text: 'x' }] }), err => {
    assert.doesNotMatch(err.message + (err.body || ''), new RegExp(COPY_KEY));
    assert.match(err.message + (err.body || ''), /\*\*\*/);
    return err.status === 502;
  });
});

test('circuit breaker is per-workload so video cannot open Ask Susan', async () => {
  const registry = structuredClone(loadRegistry());
  registry.workloads.copy.circuit.failureThreshold = 2;
  registry.retry.maxRetries = 0;
  const store = createMemoryStore();
  let copyCalls = 0, susanCalls = 0;
  const copy = createGeminiClient({
    env: { GEMINI_API_KEY_COPY: COPY_KEY, GEMINI_API_KEY_SUSAN: SUSAN_KEY },
    registry, store, clock: () => NOW, sleep: async () => {},
    fetchImpl: async () => { copyCalls += 1; return jsonResponse({}, 500); },
  });
  await assert.rejects(() => copy.generateContent({ workload: 'copy', parts: [{ text: 'a' }] }));
  await assert.rejects(() => copy.generateContent({ workload: 'copy', parts: [{ text: 'b' }] }));
  await assert.rejects(() => copy.generateContent({ workload: 'copy', parts: [{ text: 'c' }] }), CircuitOpenError);
  const susan = createGeminiClient({
    env: { GEMINI_API_KEY_COPY: COPY_KEY, GEMINI_API_KEY_SUSAN: SUSAN_KEY },
    registry, store, clock: () => NOW, sleep: async () => {},
    fetchImpl: async () => {
      susanCalls += 1;
      return jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    },
  });
  const ok = await susan.generateContent({ workload: 'ask_susan', parts: [{ text: 'symptom check' }] });
  assert.equal(ok.text, 'ok');
  assert.equal(copyCalls, 2);
  assert.equal(susanCalls, 1);
});

test('budget cap blocks a workload without charging the others', async () => {
  const store = createMemoryStore();
  await store.insertUsage({ workload: 'video', model: 'gemini-omni-1.1-flash', estimated_usd: 20, status: 'ok', created_at_ms: NOW - 1000 });
  const client = createGeminiClient({
    env: { GEMINI_API_KEY_VIDEO: VIDEO_KEY, GEMINI_API_KEY_COPY: COPY_KEY },
    store, clock: () => NOW, sleep: async () => {},
    fetchImpl: async () => { throw new Error('Gemini must not be called after the budget cap'); },
  });
  await assert.rejects(() => client.startInteraction({ payload: client.buildOmniPayload({ prompt: 'clip' }) }), BudgetExceededError);
  const copy = createGeminiClient({
    env: { GEMINI_API_KEY_COPY: COPY_KEY },
    store, clock: () => NOW, sleep: async () => {},
    fetchImpl: async () => jsonResponse({ candidates: [{ content: { parts: [{ text: '{"t":1}' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }),
  });
  const out = await copy.generateContent({ workload: 'copy', parts: [{ text: 'title' }] });
  assert.equal(out.model, 'gemini-3.5-flash');
});

test('ask_susan usage log holds counts and dollars only — never prompt or response text', async () => {
  const store = createMemoryStore();
  const secret = 'patient reports chest pain and takes lisinopril';
  const client = createGeminiClient({
    env: { GEMINI_API_KEY_SUSAN: SUSAN_KEY },
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
  await client.generateContent({ workload: 'ask_susan', parts: [{ text: secret }] });
  const row = store._usage[0];
  const dumped = JSON.stringify(row);
  assert.equal(row.workload, 'ask_susan');
  assert.equal(row.input_tokens, 40);
  assert.ok(row.estimated_usd > 0);
  assert.doesNotMatch(dumped, /chest pain|lisinopril|angina|Possible/);
  assert.deepEqual(row.metadata, {});
  const sneaky = sanitizeUsageRow({
    workload: 'ask_susan', model: 'gemini-3.5-flash', status: 'ok',
    metadata: { prompt: secret, response: 'do not store', input_tokens: 1 },
  }, { noPhi: true });
  assert.doesNotMatch(JSON.stringify(sneaky), /chest pain|do not store/);
});

test('Omni job submit/poll state machine never publishes and uploads a private draft', async () => {
  const store = createMemoryStore();
  const uploads = [];
  let phase = 0;
  const fetchImpl = async (url, options) => {
    const u = String(url);
    const key = options.headers['x-goog-api-key'];
    assert.equal(key, VIDEO_KEY);
    assert.doesNotMatch(u, /key=/);
    if (u.endsWith('/interactions') && options.method === 'POST') {
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'gemini-omni-1.1-flash');
      assert.equal(body.background, true);
      assert.equal(body.response_format.resolution, '1080p');
      assert.equal(body.response_format.type, 'video');
      assert.equal(body.response_format.delivery, 'uri');
      return jsonResponse({ id: 'int_1', status: 'in_progress', model: 'gemini-omni-1.1-flash' });
    }
    if (u.endsWith('/interactions/int_1')) {
      phase += 1;
      if (phase === 1) return jsonResponse({ id: 'int_1', status: 'in_progress' });
      return jsonResponse({
        id: 'int_1', status: 'completed', model: 'gemini-omni-1.1-flash',
        steps: [{ type: 'model_output', content: [{ type: 'video', data: Buffer.from('mp4bytes').toString('base64') }] }],
        usage: { input_tokens: 100, output_tokens: 46336 },
      });
    }
    throw new Error('unexpected ' + u);
  };
  const client = createGeminiClient({
    env: { GEMINI_API_KEY_VIDEO: VIDEO_KEY },
    fetchImpl, store, clock: () => NOW, sleep: async () => {},
  });
  const { job } = await client.submitVideoJob({
    brand: 'cnp', headline: 'Genesee evening update',
    script: 'A short look at tonight\'s community calendar. Check the site for times and locations.',
  });
  assert.equal(job.status, 'running');
  assert.equal(job.interaction_id, 'int_1');
  const mid = await client.pollVideoJobs({ upload: async () => { throw new Error('too early'); } });
  assert.equal(mid[0].status, 'running');
  const done = await client.pollVideoJobs({
    upload: async payload => { uploads.push(payload); },
  });
  assert.equal(done[0].status, 'completed');
  assert.equal(done[0].sidecar.published, false);
  assert.equal(done[0].sidecar.ai_generated, true);
  assert.match(done[0].sidecar.synthid_note, /SynthID/);
  assert.equal(done[0].sidecar.requested.resolution, '1080p');
  assert.match(done[0].cloudinary_public_id, /^satcom\/generated\//);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].bytes.toString(), 'mp4bytes');
});

test('resolution path switch is a single registry field', () => {
  const registry = structuredClone(loadRegistry());
  const payload = { response_format: { type: 'video' } };
  applyResolution(payload, registry, '1080p');
  assert.equal(payload.response_format.resolution, '1080p');
  registry.omni.resolutionPath = 'generation_config.video_config.resolution';
  const alt = { response_format: { type: 'video' } };
  applyResolution(alt, registry, '1080p');
  assert.equal(alt.generation_config.video_config.resolution, '1080p');
  assert.equal(alt.response_format.resolution, undefined);
});

test('Video Studio Gemini assist uses the copy workload key', async () => {
  const env = { VIDEO_STUDIO_PASSWORD: PASSWORD, GEMINI_API_KEY_COPY: COPY_KEY, GEMINI_API_KEY_VIDEO: VIDEO_KEY, ...CLOUD };
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

test('cron poller requires CRON_SECRET on Vercel and does not publish', async () => {
  const denied = createGeminiPollHandler({ getEnv: () => ({ VERCEL: '1' }), clock: () => NOW });
  const res = response();
  await denied({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 401);
  const store = createMemoryStore();
  const ok = createGeminiPollHandler({
    getEnv: () => ({ CRON_SECRET: 'cron-secret', GEMINI_API_KEY_VIDEO: VIDEO_KEY }),
    fetchImpl: async () => { throw new Error('no jobs'); },
    store, clock: () => NOW, sleep: async () => {},
  });
  const polled = response();
  await ok({ method: 'GET', headers: { authorization: 'Bearer cron-secret' } }, polled);
  assert.equal(polled.statusCode, 200, polled.body);
  assert.equal(polled.json.published, undefined);
  assert.match(polled.json.note, /Nothing published|Private/);
});

test('redact strips Gemini keys from arbitrary error strings', () => {
  const env = { GEMINI_API_KEY_VIDEO: VIDEO_KEY, GEMINI_API_KEY: FALLBACK_KEY };
  assert.equal(redact(`https://x?key=${VIDEO_KEY}`, env).includes(VIDEO_KEY), false);
  assert.match(redact(`x-goog-api-key: ${FALLBACK_KEY}`, env), /x-goog-api-key: \*\*\*/);
});

test('Python twin reads the same registry and fail-closes the preview model', () => {
  const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(fileURLToPath(new URL('../packages/satcom-gemini/python', import.meta.url)))})
from satcom_gemini import load_registry, resolve_model, select_key, version
reg = load_registry()
assert version() == ${JSON.stringify(VERSION)}
assert resolve_model(reg, 'video') == 'gemini-omni-1.1-flash'
try:
    resolve_model(reg, 'video', 'gemini-omni-flash-preview')
    raise SystemExit('should have denied preview model')
except Exception as e:
    assert 'denied' in str(e).lower() or 'preview' in str(e).lower()
env = {'GEMINI_API_KEY': 'f'}
try:
    select_key(env, reg, 'ask_susan')
    raise SystemExit('ask_susan must not use GEMINI_API_KEY')
except Exception:
    pass
key, source, fallback = select_key({'GEMINI_API_KEY_SUSAN': 's', 'GEMINI_API_KEY': 'f'}, reg, 'ask_susan')
assert source == 'GEMINI_API_KEY_SUSAN' and not fallback
print('ok')
`;
  const run = spawnSync('python3', ['-c', script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /ok/);
});
