import { createHash } from 'node:crypto';
import { z } from 'zod';
import { studioEnabled, passwordMatches, issueSession, verifySession, parseCookies, sessionCookie, SESSION_COOKIE } from './auth.js';
import { cloudinaryConfig, deliveryUrl, signedUploadParams, uploadBytes, searchAssets, eagerRender, privateDownloadUrl, fetchBytes, STUDIO_FOLDER } from './cloudinary.js';
import { listGeneratedClips, openGeneratedClip, isGeneratedPublicId } from './generated.js';
import { isIncomingPublicId, listIncomingUploads } from './incoming.js';
import { BRANDS, VIDEO_FORMATS, IMAGE_FORMATS, publicBrands } from './brands.js';
import { editSchema, sourceSchema, imageSourceSchema, imageBrandSchema, videoTransformation, posterTransformation, imageTransformation, resolveWindow } from './edit.js';
import { normalizeCues, cuesForWindow, toSrt, toVtt } from './captions.js';
import { aiFeatures, assistPrompt, normalizeAssist, grokAssist, geminiGenerate, grokTranscribe, geminiTranscribe, grokImage } from './ai.js';
import { draftMetaSchema, buildDraftEntry, slugify } from './drafts.js';
import { createGeminiClient, createStore, supabaseConfigured } from '../../packages/satcom-gemini/index.js';
import { dispatchPublish, publishStatusPayload, createPublishStore, attachCookieTokens } from './publish/index.js';
import { publishFlags } from './publish/config.js';

const MAX_BODY = 600_000;
const loginAttempts = new Map();

function fail(status, message) { return Object.assign(new Error(message), { status, expose: true }); }

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return JSON.parse(String(req.body) || '{}');
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY) throw fail(413, 'Request too large.');
    chunks.push(Buffer.from(chunk));
  }
  return length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function clientIp(req) {
  return String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function throttled(ip, now) {
  const entry = loginAttempts.get(ip);
  if (!entry || entry.reset < now) { loginAttempts.set(ip, { count: 1, reset: now + 15 * 60_000 }); return false; }
  entry.count += 1;
  return entry.count > 10;
}

function features(env) {
  const cfg = cloudinaryConfig(env);
  const ai = aiFeatures(env);
  const notes = [];
  if (!cfg) notes.push('Cloudinary is not configured (CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET): upload, rendering, drafts and image saving are disabled.');
  if (!ai.grok) notes.push('XAI_API_KEY is not set: Grok copy, Grok speech-to-text and Grok Imagine image tools are disabled.');
  if (!ai.gemini) notes.push('GEMINI_KEY_COPY is not set: Gemini video analysis and Gemini transcription are disabled. There is no GEMINI_API_KEY fallback.');
  if (cfg) notes.push('Generated Omni clips (Patrick\'s queue) list as private Cloudinary drafts under satcom/generated/, alongside satcom/paul-hill/originals. Creator phone uploads land in satcom/<creator>/incoming and appear in the creator-uploads queue. This studio does not submit or poll generation.');
  const pub = publishFlags(env);
  notes.push(...pub.notes);
  if (!ai.grok && !ai.gemini) notes.push('Captions can still be typed or pasted manually (SRT/WebVTT).');
  return {
    cfg,
    flags: {
      cloudinary: Boolean(cfg), grok: ai.grok, gemini: ai.gemini, generated: Boolean(cfg),
      transcribe: Boolean(cfg) && (ai.grok || ai.gemini), assist: Boolean(cfg) && (ai.grok || ai.gemini),
      images: Boolean(cfg) && ai.grok, drafts: Boolean(cfg),
      publish: pub.publish, youtube: pub.youtube, satcom: pub.satcom,
    },
    notes,
  };
}

function need(flag, message) { if (!flag) throw fail(503, message); }

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw fail(400, `${issue.path.join('.') || 'request'}: ${issue.message}`);
  }
  return result.data;
}

const cueList = z.array(z.object({ start: z.number(), end: z.number(), text: z.string().max(400) })).max(2000).default([]);
const sha = s => createHash('sha1').update(s).digest('hex').slice(0, 20);

function frameTimes(win, count) {
  return Array.from({ length: count }, (_, i) => +(win.start + (win.duration * (i + 0.5)) / count).toFixed(2));
}

async function uploadCaptions(cfg, cues, win, ext, fetchImpl, now) {
  const windowCues = cuesForWindow(cues, win.start, win.end);
  if (!windowCues.length) return null;
  const text = ext === 'vtt' ? toVtt(windowCues) : toSrt(windowCues);
  const publicId = `${STUDIO_FOLDER}/captions/${sha(text)}.${ext}`;
  await uploadBytes(cfg, { resourceType: 'raw', bytes: Buffer.from(text), filename: `captions.${ext}`, mime: ext === 'vtt' ? 'text/vtt' : 'application/x-subrip',
    params: { public_id: publicId, type: 'upload', overwrite: 'false', tags: 'satcom-studio,captions' } }, fetchImpl, now);
  return publicId;
}

function renderOutputs(cfg, source, edit, captionsId, now) {
  const stamp = new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
  return edit.formats.map(format => {
    const { transformation, window, format: f } = videoTransformation(edit, source, format, { captionsId });
    const name = `${edit.brand.preset}-${format.replace(':', 'x')}-${stamp}`;
    const url = (t, ext, resourceType = 'video') => deliveryUrl(cfg, { resourceType, type: source.type, transformation: t, publicId: source.public_id, ext });
    return {
      format, label: f.label, window, transformation,
      preview_url: url(`${transformation}/c_scale,w_${f.preview}`, 'mp4'),
      mp4_url: url(transformation, 'mp4'),
      download_url: url(`${transformation}/fl_attachment:${name}`, 'mp4'),
      poster_url: url(posterTransformation(edit, source, format), 'jpg'),
    };
  });
}

function assetView(cfg, r, kind) {
  const type = r.type === 'authenticated' ? 'authenticated'
    : (r.type === 'private' && (isGeneratedPublicId(r.public_id) || isIncomingPublicId(r.public_id)) ? 'private' : 'upload');
  return {
    public_id: r.public_id, type, created_at: r.created_at, width: r.width, height: r.height, bytes: r.bytes,
    ...(kind === 'video' ? { duration: r.duration, preview_url: deliveryUrl(cfg, { resourceType: 'video', type, publicId: r.public_id, ext: 'mp4', transformation: 'c_limit,w_1280,h_1280/q_auto' }) } : {}),
    title: r.context?.caption || r.context?.custom?.caption || r.filename || r.public_id.split('/').pop(),
    thumb_url: deliveryUrl(cfg, { resourceType: kind, type, publicId: r.public_id, ext: 'jpg',
      transformation: kind === 'video' ? 'so_1/c_fill,w_320,h_180/q_auto' : 'c_fill,w_320,h_180/q_auto' }),
    ...(kind === 'image' ? { url: deliveryUrl(cfg, { resourceType: 'image', type, publicId: r.public_id, ext: 'jpg', transformation: 'c_limit,w_1600,h_1600/q_auto' }) } : {}),
  };
}

async function storeImages(cfg, images, { tags, context }, fetchImpl, now) {
  const saved = [];
  for (const img of images) {
    const result = await uploadBytes(cfg, { resourceType: 'image', bytes: img.bytes, filename: 'grok-image', mime: img.mime,
      params: { folder: `${STUDIO_FOLDER}/images`, type: 'upload', tags, context } }, fetchImpl, now);
    saved.push(assetView(cfg, result, 'image'));
  }
  return saved;
}

const ctx = v => String(v).replace(/[|=]/g, ' ').slice(0, 900);
const IMAGE_ASPECTS = ['1:1', '9:16', '16:9', '4:3', '3:4', '2:3', '3:2', 'auto'];


export function createStudioHandler({ getEnv = () => process.env, fetchImpl = (...a) => fetch(...a), clock = Date.now, store, publishStore, sleep } = {}) {
  let memoryFallback;
  let publishFallback;
  return async function handler(req, res) {
    const env = getEnv();
    const outgoingCookies = [];
    const cookies = parseCookies(req.headers?.cookie);
    const resolveGeminiStore = () => {
      if (store) return store;
      if (supabaseConfigured(env)) return createStore(env, fetchImpl);
      return memoryFallback ||= createStore(env, fetchImpl);
    };
    const resolvePublishStore = () => attachCookieTokens(
      publishStore || (publishFallback ||= createPublishStore(env, fetchImpl)),
      env,
      cookies,
      outgoingCookies,
    );
    const sendJson = (status, body, headers = {}) => {
      if (outgoingCookies.length) {
        headers['Set-Cookie'] = headers['Set-Cookie']
          ? [headers['Set-Cookie'], ...outgoingCookies]
          : outgoingCookies.length === 1 ? outgoingCookies[0] : outgoingCookies;
      }
      return send(res, status, body, headers);
    };
    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (!studioEnabled(env)) return sendJson(200, { enabled: false, note: 'Video Studio is disabled. Set VIDEO_STUDIO_PASSWORD (12+ characters) on the server to enable it.' });
        const authed = verifySession(env, cookies[SESSION_COOKIE], clock());
        if (!authed) return sendJson(200, { enabled: true, authenticated: false });
        const { cfg, flags, notes } = features(env);
        const publish = await publishStatusPayload({ env, store: resolvePublishStore(), cfg, clock, fetchImpl });
        return sendJson(200, {
          enabled: true, authenticated: true, features: { ...flags, youtube_connected: publish.youtube_connected },
          notes, cloud_name: cfg?.cloudName || null, publish,
          brands: publicBrands(), video_formats: VIDEO_FORMATS, image_formats: IMAGE_FORMATS, image_aspects: IMAGE_ASPECTS,
        });
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, HEAD, POST'); return send(res, 405, { error: 'Method not allowed.' }); }
      if (!studioEnabled(env)) return send(res, 404, { error: 'Video Studio is disabled.' });
      // Custom header forces a CORS preflight, which this endpoint never grants (CSRF defence).
      if (req.headers?.['x-studio-request'] !== '1') return send(res, 403, { error: 'Missing studio request header.' });
      const body = await readBody(req).catch(e => { throw e.status ? e : fail(400, 'Invalid JSON body.'); });
      const op = String(body?.op || '');
      const now = clock();

      if (op === 'login') {
        await new Promise(r => setTimeout(r, 250));
        if (throttled(clientIp(req), now)) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
        if (!passwordMatches(env, body.password)) return send(res, 401, { error: 'Incorrect password.' });
        return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(env, issueSession(env, now)) });
      }
      if (op === 'logout') return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(env, '', 0) });
      if (!verifySession(env, cookies[SESSION_COOKIE], now)) return send(res, 401, { error: 'Sign in to the Video Studio.' });

      const { cfg, flags } = features(env);
      const cloudinaryMsg = 'Cloudinary is not configured on the server.';
      const geminiStore = resolveGeminiStore();
      const gemini = createGeminiClient({ env, fetchImpl, store: geminiStore, clock, sleep });

      switch (op) {
        case 'sign-upload': {
          need(flags.cloudinary, cloudinaryMsg);
          const kind = parse(z.enum(['video', 'image', 'logo']), body.kind);
          let params, resourceType = kind === 'video' ? 'video' : 'image';
          if (kind === 'video') params = { folder: `${STUDIO_FOLDER}/sources`, type: env.VIDEO_STUDIO_UPLOAD_TYPE === 'upload' ? 'upload' : 'authenticated', tags: 'satcom-studio,source' };
          else if (kind === 'image') params = { folder: `${STUDIO_FOLDER}/images`, type: 'upload', tags: 'satcom-studio,image-source' };
          else {
            const brand = parse(z.enum(Object.keys(BRANDS)), body.brand);
            params = { public_id: BRANDS[brand].logo, type: 'upload', overwrite: 'true', invalidate: 'true', tags: 'satcom-studio,brand-logo' };
          }
          const signed = signedUploadParams(cfg, params, now);
          return send(res, 200, { ...signed, upload_url: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/upload`, resource_type: resourceType });
        }
        case 'source': {
          need(flags.cloudinary, cloudinaryMsg);
          const source = parse(sourceSchema, body.source);
          const url = (t, ext) => deliveryUrl(cfg, { resourceType: 'video', type: source.type, transformation: t, publicId: source.public_id, ext });
          return send(res, 200, { preview_url: url('c_limit,w_1280,h_1280/q_auto', 'mp4'), thumb_url: url('so_1/c_fill,w_320,h_180/q_auto', 'jpg') });
        }
        case 'library': {
          need(flags.cloudinary, cloudinaryMsg);
          const kind = parse(z.enum(['video', 'image']), body.kind ?? 'video');
          const q = String(body.query || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 60);
          let expression = `resource_type:${kind} AND (type:upload OR type:authenticated`;
          if (kind === 'video' && body.scope !== 'studio') expression += ' OR (type:private AND tags=creator-upload)';
          expression += ')';
          if (body.scope === 'studio') expression += ` AND tags=satcom-studio`;
          if (q) expression += ` AND (filename:${q.split(' ')[0]}* OR tags=${q.split(' ')[0]})`;
          const result = await searchAssets(cfg, { expression, maxResults: 40 }, fetchImpl);
          return send(res, 200, { items: (result.resources || []).map(r => assetView(cfg, r, kind)) });
        }
        case 'transcribe': {
          need(flags.transcribe, 'Auto-transcription needs Cloudinary plus XAI_API_KEY or GEMINI_KEY_COPY. Type or paste captions instead.');
          const source = parse(sourceSchema, body.source);
          const win = resolveWindow(parse(editSchema, body.edit ?? {}), source);
          if (win.duration > 1800) throw fail(400, 'Transcribe at most 30 minutes at a time; narrow the trim.');
          const audioUrl = deliveryUrl(cfg, { resourceType: 'video', type: source.type, transformation: `so_${win.start},eo_${win.end}`, publicId: source.public_id, ext: 'mp3' });
          const provider = body.provider === 'gemini' || !flags.grok ? 'gemini' : 'grok';
          need(provider === 'grok' ? flags.grok : flags.gemini, `${provider} is not configured.`);
          let result;
          if (provider === 'grok') result = await grokTranscribe({ env, fetchImpl, audioUrl, offset: win.start });
          else {
            const audio = await fetchBytes(audioUrl, { maxBytes: 18_000_000, timeoutMs: 25000 }, fetchImpl).catch(e => { throw fail(e.tooLarge ? 400 : 502, e.tooLarge ? 'Audio too large for Gemini inline transcription; narrow the trim.' : 'Cloudinary is still preparing the audio. Retry in a moment.'); });
            result = await geminiTranscribe({ env, fetchImpl, audio: audio.bytes, offset: win.start, duration: win.duration, store: geminiStore, clock, sleep });
          }
          return send(res, 200, { ...result, srt: toSrt(result.cues), note: 'Machine transcript. Proofread names and quotes before rendering.' });
        }
        case 'assist': {
          need(flags.assist, 'AI assist needs Cloudinary plus XAI_API_KEY or GEMINI_KEY_COPY.');
          const provider = parse(z.enum(['grok', 'gemini']), body.provider);
          need(provider === 'grok' ? flags.grok : flags.gemini, provider === 'grok' ? 'XAI_API_KEY is not set.' : 'GEMINI_KEY_COPY is not set.');
          const source = parse(sourceSchema, body.source);
          const edit = parse(editSchema, body.edit ?? {});
          const win = resolveWindow(edit, source);
          const cues = cuesForWindow(normalizeCues(parse(cueList, body.cues)), win.start, win.end);
          const transcript = cues.map(c => `[${c.start.toFixed(1)}-${c.end.toFixed(1)}] ${c.text}`).join('\n').slice(0, 30000);
          const notes = String(body.notes || '').slice(0, 1500);
          const times = frameTimes(win, 6);
          const frameUrl = t => deliveryUrl(cfg, { resourceType: 'video', type: source.type, transformation: `so_${t}/c_limit,w_640,h_640/q_auto`, publicId: source.public_id, ext: 'jpg' });
          const frames = times.map(t => ({ t: +(t - win.start).toFixed(1), url: frameUrl(t) }));
          let out;
          if (provider === 'grok') {
            out = await grokAssist({ env, fetchImpl, prompt: assistPrompt({ brand: edit.brand.preset, window: win, transcript, notes, frames }), frameUrls: frames.map(f => f.url) });
          } else {
            let parts = null;
            if (win.duration <= 240) {
              const clipUrl = deliveryUrl(cfg, { resourceType: 'video', type: source.type, transformation: `so_${win.start},eo_${win.end}/c_limit,w_480,h_480/q_auto:low`, publicId: source.public_id, ext: 'mp4' });
              const clip = await fetchBytes(clipUrl, { maxBytes: 18_000_000, timeoutMs: 30000 }, fetchImpl).catch(() => null);
              if (clip) parts = [{ inline_data: { mime_type: 'video/mp4', data: clip.bytes.toString('base64') } }, { text: assistPrompt({ brand: edit.brand.preset, window: win, transcript, notes }) }];
            }
            if (!parts) {
              const images = [];
              for (const f of frames) {
                const img = await fetchBytes(f.url, { maxBytes: 3_000_000, timeoutMs: 15000 }, fetchImpl).catch(() => null);
                if (img) images.push({ inline_data: { mime_type: 'image/jpeg', data: img.bytes.toString('base64') } });
              }
              parts = [...images, { text: assistPrompt({ brand: edit.brand.preset, window: win, transcript, notes, frames: images.length ? frames : [] }) }];
            }
            out = await geminiGenerate({ env, fetchImpl, parts, store: geminiStore, clock, sleep, client: gemini });
          }
          return send(res, 200, normalizeAssist(out.raw, win, provider, out.model));
        }
        case 'render': {
          need(flags.cloudinary, cloudinaryMsg);
          const source = parse(sourceSchema, body.source);
          const edit = parse(editSchema, body.edit ?? {});
          const win = resolveWindow(edit, source);
          const cues = normalizeCues(parse(cueList, body.cues));
          const captionsId = edit.captions.enabled && cues.length ? await uploadCaptions(cfg, cues, win, 'srt', fetchImpl, now) : null;
          return send(res, 200, { outputs: renderOutputs(cfg, source, edit, captionsId, now), captions: Boolean(captionsId),
            note: 'Cloudinary renders on first request; long or large clips may take a minute. Use "Pre-render" for clips over ~40 MB.' });
        }
        case 'prerender': {
          need(flags.cloudinary, cloudinaryMsg);
          const source = parse(sourceSchema, body.source);
          const edit = parse(editSchema, body.edit ?? {});
          const win = resolveWindow(edit, source);
          const cues = normalizeCues(parse(cueList, body.cues));
          const captionsId = edit.captions.enabled && cues.length ? await uploadCaptions(cfg, cues, win, 'srt', fetchImpl, now) : null;
          const eager = edit.formats.map(f => `${videoTransformation(edit, source, f, { captionsId }).transformation}/mp4`).join('|');
          await eagerRender(cfg, { type: source.type, publicId: source.public_id, eager }, fetchImpl, now);
          return send(res, 200, { queued: edit.formats, note: 'Cloudinary is rendering in the background. Refresh the previews in a minute or two.' });
        }
        case 'draft-save': {
          need(flags.drafts, cloudinaryMsg);
          const source = parse(sourceSchema, body.source);
          const edit = parse(editSchema, body.edit ?? {});
          const format = parse(z.enum(Object.keys(VIDEO_FORMATS)), body.format);
          const meta = parse(draftMetaSchema, body.meta ?? {});
          const oneFormat = { ...edit, formats: [format] };
          const win = resolveWindow(oneFormat, source);
          const cues = normalizeCues(parse(cueList, body.cues));
          const captionsId = edit.captions.enabled && cues.length ? await uploadCaptions(cfg, cues, win, 'srt', fetchImpl, now) : null;
          const [output] = renderOutputs(cfg, source, oneFormat, captionsId, now);
          const vttId = cues.length ? await uploadCaptions(cfg, cues, win, 'vtt', fetchImpl, now) : null;
          const vttUrl = vttId ? `https://res.cloudinary.com/${cfg.cloudName}/raw/upload/${vttId}` : undefined;
          const posterOverride = typeof body.poster_url === 'string' && body.poster_url.startsWith(`https://res.cloudinary.com/${cfg.cloudName}/image/`) && body.poster_url.length < 2048 ? body.poster_url : null;
          const draft = buildDraftEntry({ meta, now, playbackUrl: output.mp4_url, posterUrl: posterOverride || output.poster_url, vttUrl, brand: edit.brand.preset, format, source, window: win });
          const publicId = `${STUDIO_FOLDER}/drafts/${draft.entry.id}.json`;
          await uploadBytes(cfg, { resourceType: 'raw', bytes: Buffer.from(JSON.stringify(draft.entry, null, 2)), filename: `${draft.entry.id}.json`, mime: 'application/json',
            params: { public_id: publicId, type: 'private', overwrite: 'true', tags: 'satcom-studio,satcom-draft', context: `caption=${ctx(meta.title)}|brand=${edit.brand.preset}|format=${format}` } }, fetchImpl, now);
          return send(res, 200, { ...draft, stored: { provider: 'cloudinary', public_id: publicId, type: 'private' },
            note: 'Saved as a private draft (published:false). The public /api/videos feed excludes it. Publishing is a separate manual, reviewed step.' });
        }
        case 'draft-list': {
          need(flags.drafts, cloudinaryMsg);
          const result = await searchAssets(cfg, { expression: 'resource_type:raw AND tags=satcom-draft', maxResults: 50 }, fetchImpl);
          return send(res, 200, { drafts: (result.resources || []).map(r => ({
            id: r.public_id.split('/').pop().replace(/\.json$/, ''), title: r.context?.caption || r.context?.custom?.caption || '',
            brand: r.context?.brand || r.context?.custom?.brand || '', format: r.context?.format || r.context?.custom?.format || '', created_at: r.created_at,
          })) });
        }
        case 'draft-get': {
          need(flags.drafts, cloudinaryMsg);
          const id = parse(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120), body.id);
          const file = await fetchBytes(privateDownloadUrl(cfg, { publicId: `${STUDIO_FOLDER}/drafts/${id}.json`, type: 'private' }, now), { maxBytes: 300_000 }, fetchImpl)
            .catch(() => { throw fail(404, 'Draft not found.'); });
          return send(res, 200, { draft: JSON.parse(file.bytes.toString('utf8')) });
        }
        case 'image-generate':
        case 'image-edit': {
          need(flags.images, 'Grok image tools need XAI_API_KEY and Cloudinary on the server.');
          const prompt = parse(z.string().trim().min(3).max(2000), body.prompt);
          const aspect = parse(z.enum(IMAGE_ASPECTS).default('1:1'), body.aspect_ratio);
          const resolution = parse(z.enum(['1k', '1.5k', '2k']).default('1k'), body.resolution);
          const brandStyle = body.brand && BRANDS[body.brand] && body.brand_style ? BRANDS[body.brand] : null;
          const fullPrompt = brandStyle ? `${prompt}\n\nStyle: clean editorial look for ${brandStyle.label}, a Colorado community newspaper; palette #${brandStyle.primary} and #${brandStyle.accent}; leave clear space for a headline; no fake logos or text.` : prompt;
          let imageDataUrl, sourceRef = '';
          if (op === 'image-edit') {
            let url;
            if (body.frame) {
              const source = parse(sourceSchema, body.frame.source);
              const t = parse(z.number().min(0).max(6 * 3600), body.frame.t);
              url = deliveryUrl(cfg, { resourceType: 'video', type: source.type, transformation: `so_${+t.toFixed(2)}/c_limit,w_2048,h_2048/q_auto`, publicId: source.public_id, ext: 'jpg' });
              sourceRef = `${source.public_id}@${t.toFixed(1)}s`;
            } else {
              const image = parse(imageSourceSchema, body.image);
              url = deliveryUrl(cfg, { resourceType: 'image', type: image.type, transformation: 'c_limit,w_2048,h_2048/q_auto', publicId: image.public_id, ext: 'jpg' });
              sourceRef = image.public_id;
            }
            const src = await fetchBytes(url, { maxBytes: 12_000_000, timeoutMs: 25000 }, fetchImpl).catch(() => { throw fail(502, 'Could not read the source image from Cloudinary. Retry in a moment.'); });
            imageDataUrl = `data:image/jpeg;base64,${src.bytes.toString('base64')}`;
          }
          const { images, model } = await grokImage({ env, fetchImpl, prompt: fullPrompt, aspectRatio: aspect === 'auto' && op === 'image-generate' ? undefined : aspect, resolution, imageDataUrl });
          const saved = await storeImages(cfg, images, {
            tags: `satcom-studio,ai-generated,grok-imagine,${op === 'image-edit' ? 'grok-edit' : 'grok-generate'}`,
            context: `caption=${ctx(prompt)}|alt=AI-generated image${sourceRef ? `|source=${ctx(sourceRef)}` : ''}`,
          }, fetchImpl, now);
          return send(res, 200, { images: saved, model, note: 'AI-generated image saved to Cloudinary (satcom-studio/images). Label AI imagery per newsroom policy.' });
        }
        case 'image-brand':
        case 'image-save': {
          need(flags.cloudinary, cloudinaryMsg);
          const image = parse(imageSourceSchema, body.image);
          const spec = parse(imageBrandSchema, body.spec ?? {});
          const stamp = new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
          const outputs = spec.formats.map(format => {
            const { transformation, format: f } = imageTransformation(spec, format);
            const name = `${spec.brand.preset}-${slugify(format.replace(':', 'x'))}-${stamp}`;
            return { format, label: f.label, transformation,
              url: deliveryUrl(cfg, { resourceType: 'image', type: image.type, transformation, publicId: image.public_id, ext: 'jpg' }),
              download_url: deliveryUrl(cfg, { resourceType: 'image', type: image.type, transformation: `${transformation}/fl_attachment:${name}`, publicId: image.public_id, ext: 'jpg' }) };
          });
          if (op === 'image-brand') return send(res, 200, { outputs });
          const saved = [];
          for (const o of outputs) {
            const result = await uploadBytes(cfg, { resourceType: 'image', fileUrl: o.url, params: { folder: `${STUDIO_FOLDER}/social`, type: 'upload',
              tags: `satcom-studio,satcom-social,${spec.brand.preset}`, context: `caption=${ctx(spec.headline || 'Social graphic')}|brand=${spec.brand.preset}|format=${o.format}` } }, fetchImpl, now);
            saved.push({ format: o.format, ...assetView(cfg, result, 'image') });
          }
          return send(res, 200, { saved });
        }
        case 'generated-list': {
          need(flags.generated, cloudinaryMsg);
          const items = await listGeneratedClips(cfg, fetchImpl);
          return send(res, 200, {
            items,
            folder: 'satcom/generated',
            originals_folder: 'satcom/paul-hill/originals',
            published: false,
            note: 'Private Cloudinary drafts from Patrick\'s Omni queue. This studio lists and opens them; it does not generate.',
          });
        }
        case 'creator-uploads': {
          need(flags.cloudinary, cloudinaryMsg);
          const items = await listIncomingUploads(cfg, fetchImpl);
          return send(res, 200, {
            items,
            folder: 'satcom/*/incoming',
            published: false,
            note: 'Private creator phone uploads. They stay drafts until you review and publish.',
          });
        }
        case 'generated-get': {
          need(flags.generated, cloudinaryMsg);
          const publicId = parse(z.string().refine(isGeneratedPublicId, 'Generated clips must live under satcom/generated/'), body.public_id);
          const clip = await openGeneratedClip(cfg, publicId, fetchImpl, now);
          return send(res, 200, clip);
        }
        default: {
          const published = await dispatchPublish(op, body, {
            env, store: resolvePublishStore(), cfg, fetchImpl, clock,
            session: cookies[SESSION_COOKIE],
          });
          if (published) return sendJson(200, published);
          return send(res, 400, { error: 'Unknown studio operation.' });
        }
      }
    } catch (error) {
      // Never echo provider responses, URLs with signatures, or credentials.
      const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
      return send(res, status, { error: error?.expose ? String(error.message).slice(0, 300) : 'Studio request failed.' });
    }
  };
}
