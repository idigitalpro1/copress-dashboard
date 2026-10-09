import { SOCIAL_PLATFORMS, BRANDS } from './brands.js';
import { wordsToCues, normalizeCues } from './captions.js';
import { createGeminiClient, hasWorkloadKey, loadRegistry } from '../../packages/satcom-gemini/index.js';

export const DEFAULT_XAI_MODEL = 'grok-4.7';
export const DEFAULT_XAI_IMAGE_MODEL = 'grok-imagine-image-2.0';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

export function aiFeatures(env) {
  const registry = loadRegistry();
  return {
    grok: Boolean(env.XAI_API_KEY),
    gemini: hasWorkloadKey(env, registry, 'copy'),
  };
}

function providerError(provider, status) {
  const e = new Error(`${provider} request failed${status ? ` (${status})` : ''}. Check the API key, model and quota.`);
  e.status = 502; e.expose = true; return e;
}

function extractJson(text) {
  const s = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  const first = s.indexOf('{'), last = s.lastIndexOf('}');
  if (first < 0 || last < first) throw Object.assign(new Error('The model did not return JSON.'), { status: 502, expose: true });
  return JSON.parse(s.slice(first, last + 1));
}

export const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : '');

export function assistPrompt({ brand, window, transcript, notes, frames = [] }) {
  const b = BRANDS[brand] || BRANDS.satcom;
  return [
    `You are the social video editor for ${b.label} (${b.tagline}), a Colorado community news publication in the SATCOM / Colorado News Press network.`,
    `You are given a news video clip window that is ${window.duration} seconds long. All times you return are seconds from the START OF THIS WINDOW (0 to ${window.duration}).`,
    'Write accurate, non-sensational copy. Do not invent names, places, quotes or facts that are not in the transcript, frames or notes. Mark uncertain facts with [verify].',
    'Suggest the single strongest highlight for a social cut: about 15 seconds (never longer than 60 and never beyond the window).',
    notes ? `Editor notes: ${notes}` : '',
    transcript ? `Transcript (window-relative seconds):\n${transcript}` : 'No transcript is available.',
    frames.length ? `Frames are attached in order at these window-relative times: ${frames.map(f => f.t).join(', ')}s.` : '',
    `Return ONLY JSON: {"titles":[3 strings, <=90 chars],"description":"<=400 chars","caption_hook":"<=80 chars on-screen hook","hashtags":[<=6 strings without #],"social":{${SOCIAL_PLATFORMS.map(p => `"${p}":"post copy"`).join(',')}},"highlight":{"start":number,"end":number,"reason":"string"}}`,
    'Platform guidance: x <=260 chars; facebook 1-3 short paragraphs; instagram with line breaks and hashtags at the end; tiktok short and conversational; youtube_shorts a title-style line plus one sentence; linkedin professional community-news tone.',
  ].filter(Boolean).join('\n\n');
}

export function normalizeAssist(raw, window, provider, model) {
  const social = {};
  for (const p of SOCIAL_PLATFORMS) social[p] = str(raw?.social?.[p], 2200);
  let start = Number(raw?.highlight?.start), end = Number(raw?.highlight?.end);
  let highlight = null;
  if (Number.isFinite(start) && Number.isFinite(end)) {
    start = Math.max(0, Math.min(start, window.duration)); end = Math.max(0, Math.min(end, window.duration));
    if (end - start > 60) end = start + 60;
    if (end - start >= 1) highlight = { start: +(window.start + start).toFixed(2), end: +(window.start + end).toFixed(2), reason: str(raw.highlight.reason, 300) };
  }
  return {
    provider, model,
    titles: (Array.isArray(raw?.titles) ? raw.titles : []).map(t => str(t, 120)).filter(Boolean).slice(0, 5),
    description: str(raw?.description, 1000),
    caption_hook: str(raw?.caption_hook, 120),
    hashtags: (Array.isArray(raw?.hashtags) ? raw.hashtags : []).map(t => str(t, 40).replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 8),
    social, highlight,
    note: 'AI draft copy. An editor must verify facts before publishing.',
  };
}

export async function grokAssist({ env, fetchImpl, prompt, frameUrls }) {
  const model = env.XAI_MODEL || DEFAULT_XAI_MODEL;
  const content = [{ type: 'text', text: prompt }, ...frameUrls.map(url => ({ type: 'image_url', image_url: { url, detail: 'low' } }))];
  const response = await fetchImpl('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content }], response_format: { type: 'json_object' }, temperature: 0.6 }),
    signal: AbortSignal.timeout(50000),
  });
  if (!response.ok) throw providerError('Grok', response.status);
  const data = await response.json();
  return { raw: extractJson(data?.choices?.[0]?.message?.content), model };
}

export async function geminiGenerate({ env, fetchImpl, parts, store, clock, sleep, client }) {
  const gemini = client || createGeminiClient({ env, fetchImpl, store, clock, sleep });
  const result = await gemini.generateContent({
    workload: 'copy',
    parts,
    model: env.GEMINI_MODEL,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.5 },
  });
  return { raw: extractJson(result.text), model: result.model };
}

// xAI speech-to-text; xAI downloads the (signed) audio URL itself.
export async function grokTranscribe({ env, fetchImpl, audioUrl, offset }) {
  const form = new FormData();
  form.append('format', 'true');
  form.append('language', env.VIDEO_STUDIO_LANGUAGE || 'en');
  form.append('url', audioUrl);
  const response = await fetchImpl('https://api.x.ai/v1/stt', {
    method: 'POST', headers: { Authorization: `Bearer ${env.XAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) throw providerError('Grok speech-to-text', response.status);
  const data = await response.json();
  return { cues: wordsToCues(data?.words, offset), text: str(data?.text, 20000), provider: 'grok' };
}

export async function geminiTranscribe({ env, fetchImpl, audio, offset, duration, store, clock, sleep, client }) {
  const { raw, model } = await geminiGenerate({ env, fetchImpl, store, clock, sleep, client, parts: [
    { inline_data: { mime_type: 'audio/mp3', data: audio.toString('base64') } },
    { text: `Transcribe this ${duration}-second news audio verbatim for burned-in captions. Split into cues of at most 42 characters and 3.5 seconds. Return ONLY JSON {"cues":[{"start":seconds,"end":seconds,"text":"..."}]} with times from the start of the audio.` },
  ] });
  const cues = normalizeCues((raw?.cues || []).map(c => ({ start: Number(c.start) + offset, end: Number(c.end) + offset, text: c.text })));
  return { cues, text: cues.map(c => c.text).join(' '), provider: 'gemini', model };
}

// Grok Imagine: generate or edit. Always returns base64 so the result can be stored in Cloudinary.
export async function grokImage({ env, fetchImpl, prompt, aspectRatio, resolution, imageDataUrl, n = 1 }) {
  const model = env.XAI_IMAGE_MODEL || DEFAULT_XAI_IMAGE_MODEL;
  const body = { model, prompt, n, response_format: 'b64_json', resolution };
  if (aspectRatio) body.aspect_ratio = aspectRatio;
  if (imageDataUrl) body.image = { url: imageDataUrl, type: 'image_url' };
  const response = await fetchImpl(`https://api.x.ai/v1/images/${imageDataUrl ? 'edits' : 'generations'}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) throw providerError('Grok Imagine', response.status);
  const data = await response.json();
  const images = (data?.data || []).filter(d => typeof d?.b64_json === 'string')
    .map(d => ({ bytes: Buffer.from(d.b64_json, 'base64'), mime: d.mime_type || 'image/jpeg' }));
  if (!images.length) throw Object.assign(new Error('Grok Imagine returned no image (the prompt may have been declined).'), { status: 502, expose: true });
  return { images, model };
}
