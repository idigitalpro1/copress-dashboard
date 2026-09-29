import { resolveModel } from './registry.js';
import { selectKey } from './keys.js';
import { geminiFetch } from './http.js';
import { estimateCost, usageFromInteraction } from './cost.js';
import { assertLimits, recordSuccess, recordFailure } from './limits.js';
import { sanitizeUsageRow } from './store.js';
import { redact } from './redact.js';

const FILE_RE = /files\/([^/:?\s]+)/;

export function setByPath(target, path, value) {
  const parts = String(path).split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts.at(-1)] = value;
  return target;
}

export function applyResolution(payload, registry, resolution) {
  const path = registry.omni?.resolutionPath || 'response_format.resolution';
  return setByPath(payload, path, resolution);
}

export function buildOmniPayload({ registry, prompt, aspect = '16:9', resolution, apiDuration, inputParts }) {
  const model = resolveModel(registry, 'video').model;
  const res = resolution || registry.omni.defaultResolution || '1080p';
  const aspects = registry.omni.aspectRatios || ['16:9', '9:16'];
  if (!aspects.includes(aspect)) {
    const error = new Error(`aspect_ratio must be one of ${aspects.join(', ')}`);
    error.status = 400; error.expose = true; throw error;
  }
  const responseFormat = {
    type: 'video',
    aspect_ratio: aspect,
    delivery: registry.omni.delivery || 'uri',
  };
  if (apiDuration) responseFormat.duration = apiDuration;
  const payload = {
    model,
    input: inputParts?.length ? [...inputParts, { type: 'text', text: prompt }] : prompt,
    response_format: responseFormat,
    background: true,
  };
  applyResolution(payload, registry, res);
  return payload;
}

export function findVideo(interaction) {
  for (const step of interaction?.steps || []) {
    if (step?.type !== 'model_output') continue;
    for (const c of step.content || []) if (c?.type === 'video') return c;
  }
  const ov = interaction?.output_video;
  return ov && typeof ov === 'object' ? ov : null;
}

export async function startInteraction(client, { payload, timeoutMs = 55000 }) {
  const { env, registry, fetchImpl, store, sleep, clock } = client;
  const model = resolveModel(registry, 'video', payload.model).model;
  payload = { ...payload, model };
  const { key, source } = selectKey(env, registry, 'video');
  const now = clock();
  const estimate = estimateCost(registry, {
    model,
    videoSeconds: registry.omni.targetSeconds || 8,
    resolution: payload.response_format?.resolution || registry.omni.defaultResolution,
  });
  await assertLimits(store, registry, 'video', { now, estimatedUsd: estimate.estimatedUsd });
  const url = `${registry.omni.apiBase}/interactions`;
  const t0 = clock();
  let status = 'ok';
  let data;
  try {
    const response = await geminiFetch({
      fetchImpl, env, registry, workload: 'video', key, method: 'POST', url,
      body: payload, timeoutMs, sleep,
    });
    data = await response.json();
    await recordSuccess(store, 'video', clock());
  } catch (error) {
    status = 'error';
    if (!error.status || error.status === 429 || error.status >= 500) {
      await recordFailure(store, registry, 'video', clock());
    }
    throw error;
  } finally {
    try {
      await store.insertUsage(sanitizeUsageRow({
        workload: 'video',
        model,
        video_seconds: registry.omni.targetSeconds || 8,
        estimated_usd: estimate.estimatedUsd,
        status: status === 'ok' ? 'submitted' : 'error',
        latency_ms: clock() - t0,
        metadata: { key_source: source, interaction_id: data?.id || null },
        created_at_ms: t0,
      }));
    } catch { /* usage log must not hide the API result */ }
  }
  return data;
}

export async function getInteraction(client, id, { timeoutMs = 30000 } = {}) {
  const { env, registry, fetchImpl, sleep } = client;
  const { key } = selectKey(env, registry, 'video');
  const url = `${registry.omni.apiBase}/interactions/${encodeURIComponent(id)}`;
  const response = await geminiFetch({
    fetchImpl, env, registry, workload: 'video', key, method: 'GET', url, timeoutMs, sleep,
  });
  return response.json();
}

export async function downloadVideoBytes(client, video, { timeoutMs = 50000, maxBytes = 80_000_000 } = {}) {
  const { env, registry, fetchImpl, sleep, clock } = client;
  const { key } = selectKey(env, registry, 'video');
  if (video?.data) return Buffer.from(video.data, 'base64');
  const uri = video?.uri;
  if (!uri) {
    const error = new Error('Completed interaction has a video step but neither data nor uri.');
    error.status = 502; error.expose = true; throw error;
  }
  const match = String(uri).match(FILE_RE);
  if (!match) {
    const error = new Error(redact(`Could not parse file id from video uri: ${uri}`, env));
    error.status = 502; error.expose = true; throw error;
  }
  const fileId = match[1];
  const deadline = clock() + timeoutMs;
  while (true) {
    const stateResp = await geminiFetch({
      fetchImpl, env, registry, workload: 'video', key, method: 'GET',
      url: `${registry.omni.apiBase}/files/${fileId}`, timeoutMs: 20000, sleep,
    });
    const state = (await stateResp.json()).state;
    if (state === 'ACTIVE') break;
    if (state === 'FAILED') {
      const error = new Error(`Gemini file ${fileId} processing FAILED.`);
      error.status = 502; error.expose = true; throw error;
    }
    if (clock() > deadline) {
      const error = new Error(`Timed out waiting for file ${fileId} (last: ${state}).`);
      error.status = 504; error.expose = true; throw error;
    }
    await sleep(5000);
  }
  const download = await geminiFetch({
    fetchImpl, env, registry, workload: 'video', key, method: 'GET',
    url: `${registry.omni.apiBase}/files/${fileId}:download?alt=media`, timeoutMs, sleep,
  });
  const buffer = Buffer.from(await download.arrayBuffer());
  if (buffer.length > maxBytes) {
    const error = new Error('Generated video exceeds size limit.');
    error.status = 502; error.expose = true; throw error;
  }
  return buffer;
}

export function buildNewsPrompt({ brand, town, headline, script, seconds = 8 }) {
  return (
    `Local news video for ${brand}, ${town}. ` +
    'Natural daylight, realistic documentary look, steady camera with slow, ' +
    'smooth movement, clean broadcast framing, one continuous shot of about ' +
    `${seconds} seconds with no scene cuts. ` +
    `Show only what this script describes: "${script}" ` +
    `Use generic, non-identifiable local scenery that fits ${town}, Colorado; ` +
    'any people are distant, incidental and not recognizable. ' +
    `A clean, legible lower-third caption appears early and stays on screen, ` +
    `reading exactly: lower-third "${headline}". No other on-screen text. ` +
    'Audio: a clear, warm, professional local-news narrator (off-camera ' +
    'voiceover, neutral American accent, measured pace) reads the script word ' +
    `for word and says nothing else: "${script}" Soft natural ambient sound ` +
    'under the voice; no music; no extra sound effects. ' +
    'No logos, brand marks, watermarks or channel bugs of any kind. ' +
    'No fake interviews, no officials, no reporters or anchors on camera, and no ' +
    'real or identifiable people. No names, numbers, dates, places or claims ' +
    'beyond the script and headline. ' +
    'End on a stable wide shot. No extra claims.'
  );
}

export const OMNI_BRANDS = {
  villager: { name: 'The Villager', town: 'Greenwood Village' },
  'the-villager': { name: 'The Villager', town: 'Greenwood Village' },
  wrc: { name: 'Weekly Register-Call', town: 'Central City' },
  'register-call': { name: 'Weekly Register-Call', town: 'Central City' },
  cnp: { name: 'Colorado News Press', town: 'Genesee' },
  'colorado-news-press': { name: 'Colorado News Press', town: 'Genesee' },
  satcom: { name: 'SATCOM', town: 'Colorado' },
};
