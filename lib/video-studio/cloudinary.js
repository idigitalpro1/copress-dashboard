import { createHash } from 'node:crypto';

export const STUDIO_FOLDER = 'satcom-studio';
export const GENERATED_FOLDER = 'satcom/generated';
export const ORIGINALS_FOLDER = 'satcom/paul-hill/originals';
const PUBLIC_ID = /^(?!.*\.\.)[A-Za-z0-9_][A-Za-z0-9_\-/.]{0,254}$/;

// Reads CLOUDINARY_URL (cloudinary://key:secret@cloud) or the three separate variables.
export function cloudinaryConfig(env) {
  let cloudName = env.CLOUDINARY_CLOUD_NAME, apiKey = env.CLOUDINARY_API_KEY, apiSecret = env.CLOUDINARY_API_SECRET;
  if (env.CLOUDINARY_URL && (!cloudName || !apiKey || !apiSecret)) {
    try {
      const url = new URL(env.CLOUDINARY_URL);
      if (url.protocol === 'cloudinary:') {
        cloudName ||= url.hostname; apiKey ||= decodeURIComponent(url.username); apiSecret ||= decodeURIComponent(url.password);
      }
    } catch { /* ignore malformed URL */ }
  }
  if (!cloudName || !apiKey || !apiSecret || !/^[A-Za-z0-9_-]{1,64}$/.test(cloudName)) return null;
  return { cloudName, apiKey, apiSecret };
}

export function validPublicId(value) {
  return typeof value === 'string' && PUBLIC_ID.test(value);
}

export function colonId(publicId) {
  return publicId.replace(/\//g, ':');
}

// Text for l_text layers: URL-encode, then double-escape commas and slashes.
export function layerText(text) {
  return encodeURIComponent(String(text))
    .replace(/%2C/gi, '%252C').replace(/%2F/gi, '%252F')
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// Upload/Admin API parameter signature (SHA-1 over sorted params + secret).
export function apiSignature(params, apiSecret) {
  const toSign = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort().map(k => `${k}=${Array.isArray(params[k]) ? params[k].join(',') : params[k]}`).join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
}

// Delivery URL signature (s--XXXXXXXX--). Every studio URL is signed, so it works with
// "strict transformations" and with `authenticated` uploads.
export function deliveryUrl(cfg, { resourceType = 'video', type = 'upload', transformation = '', publicId, ext }) {
  const source = ext ? `${publicId}.${ext}` : publicId;
  const toSign = [transformation, source].filter(Boolean).join('/');
  const sig = createHash('sha1').update(toSign + cfg.apiSecret).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').slice(0, 8);
  return `https://res.cloudinary.com/${cfg.cloudName}/${resourceType}/${type}/s--${sig}--/${toSign}`;
}

export function signedUploadParams(cfg, params, now = Date.now()) {
  const timestamp = Math.floor(now / 1000);
  const all = { ...params, timestamp };
  return { cloudName: cfg.cloudName, apiKey: cfg.apiKey, timestamp, signature: apiSignature(all, cfg.apiSecret), params };
}

function basicAuth(cfg) {
  return 'Basic ' + Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString('base64');
}

async function cloudinaryJson(response) {
  let body = {};
  try { body = await response.json(); } catch { /* non-JSON */ }
  if (!response.ok) {
    const message = typeof body?.error?.message === 'string' ? body.error.message.slice(0, 300) : `Cloudinary request failed (${response.status})`;
    const error = new Error(message); error.status = response.status; error.expose = true; throw error;
  }
  return body;
}

// Server-side signed upload of bytes (captions, drafts, generated images).
export async function uploadBytes(cfg, { resourceType, bytes, fileUrl, filename, mime, params, timeoutMs = 30000 }, fetchImpl = fetch, now = Date.now()) {
  const signed = signedUploadParams(cfg, params, now);
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
  form.append('api_key', cfg.apiKey);
  form.append('timestamp', String(signed.timestamp));
  form.append('signature', signed.signature);
  if (fileUrl) form.append('file', fileUrl);
  else form.append('file', new Blob([bytes], { type: mime }), filename);
  const response = await fetchImpl(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/upload`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(timeoutMs),
  });
  return cloudinaryJson(response);
}

const ctxField = v => String(v).replace(/[|=]/g, ' ').slice(0, 900);

export async function uploadGeneratedDraft(cfg, { bytes, publicId, sidecar, filename }, fetchImpl = fetch, now = Date.now()) {
  const video = await uploadBytes(cfg, {
    resourceType: 'video', bytes, filename, mime: 'video/mp4', timeoutMs: 55000,
    params: {
      public_id: publicId, type: 'private', overwrite: 'false',
      tags: 'satcom-generated,ai-generated,gemini-omni,draft',
      context: `caption=${ctxField(sidecar?.source?.headline || 'AI-generated clip')}|ai_generated=true|published=false`,
    },
  }, fetchImpl, now);
  const json = await uploadBytes(cfg, {
    resourceType: 'raw',
    bytes: Buffer.from(JSON.stringify(sidecar, null, 2)),
    filename: `${filename || 'clip'}.json`,
    mime: 'application/json',
    timeoutMs: 20000,
    params: {
      public_id: `${publicId}-sidecar`, type: 'private', overwrite: 'true',
      tags: 'satcom-generated,ai-generated,sidecar,draft',
    },
  }, fetchImpl, now);
  return { video, sidecar: json };
}

export async function searchAssets(cfg, { expression, maxResults = 30 }, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/resources/search`, {
    method: 'POST',
    headers: { Authorization: basicAuth(cfg), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expression, sort_by: [{ created_at: 'desc' }], max_results: maxResults, with_field: ['context', 'tags'] }),
    signal: AbortSignal.timeout(15000),
  });
  return cloudinaryJson(response);
}

// Queue an asynchronous eager render so long clips do not hit on-the-fly limits.
export async function eagerRender(cfg, { resourceType = 'video', type, publicId, eager }, fetchImpl = fetch, now = Date.now()) {
  const params = { public_id: publicId, type, eager, eager_async: 'true' };
  const signed = signedUploadParams(cfg, params, now);
  const form = new URLSearchParams({ ...params, api_key: cfg.apiKey, timestamp: String(signed.timestamp), signature: signed.signature });
  const response = await fetchImpl(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/explicit`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(20000),
  });
  return cloudinaryJson(response);
}

export function privateDownloadUrl(cfg, { resourceType = 'raw', publicId, type = 'private' }, now = Date.now()) {
  const params = { public_id: publicId, timestamp: Math.floor(now / 1000), type };
  const signature = apiSignature(params, cfg.apiSecret);
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: cfg.apiKey, signature });
  return `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/download?${query}`;
}

// Bounded fetch of a derived asset (used to hand media to AI providers).
export async function fetchBytes(url, { maxBytes, timeoutMs = 25000 }, fetchImpl = fetch) {
  const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok || !response.body) { const e = new Error(`Media not ready (${response.status})`); e.status = response.status; throw e; }
  const reader = response.body.getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); const e = new Error('Media exceeds size limit'); e.tooLarge = true; throw e; }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return { bytes: Buffer.concat(chunks), mime: response.headers.get('content-type') || 'application/octet-stream' };
}
