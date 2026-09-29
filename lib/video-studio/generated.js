import { GENERATED_FOLDER, ORIGINALS_FOLDER, deliveryUrl, privateDownloadUrl, searchAssets, fetchBytes } from './cloudinary.js';
import { loadRegistry, resolveModel } from '../../packages/satcom-gemini/index.js';

export { GENERATED_FOLDER, ORIGINALS_FOLDER };

const SIDECAR_ALIASES = {
  aspect: ['aspect', 'aspect_ratio'],
  timestamp: ['timestamp', 'generated_at'],
  synthid_note: ['synthid_note', 'synthidNote', 'ai_disclosure'],
};

export function isGeneratedPublicId(publicId) {
  return typeof publicId === 'string' && publicId.startsWith(`${GENERATED_FOLDER}/`) && !publicId.includes('..');
}

export function sidecarPublicId(publicId) {
  return `${publicId}-sidecar`;
}

export function generatedSearchExpression() {
  return `resource_type:video AND type:private AND folder:${GENERATED_FOLDER}`;
}

export function flattenSidecar(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const pick = (canonical) => {
    for (const key of SIDECAR_ALIASES[canonical] || [canonical]) {
      if (raw[key] != null && raw[key] !== '') return raw[key];
    }
    if (canonical === 'resolution' && raw.requested?.resolution) return raw.requested.resolution;
    if (canonical === 'duration' && raw.requested?.duration) return raw.requested.duration;
    return undefined;
  };
  return {
    model: raw.model,
    prompt: raw.prompt,
    resolution: pick('resolution') ?? raw.resolution,
    duration: pick('duration') ?? raw.duration,
    aspect: pick('aspect'),
    timestamp: pick('timestamp'),
    synthid_note: pick('synthid_note'),
  };
}

export function validateSidecar(raw, registry = loadRegistry()) {
  const sidecar = flattenSidecar(raw);
  const fields = registry.handoff?.sidecarFields || ['model', 'prompt', 'resolution', 'duration', 'aspect', 'timestamp', 'synthid_note'];
  const missing = fields.filter(f => sidecar[f] == null || sidecar[f] === '');
  let modelOk = false;
  try {
    resolveModel(registry, 'video', sidecar.model);
    modelOk = true;
  } catch {
    modelOk = false;
  }
  return { ok: missing.length === 0 && modelOk, missing, modelOk, sidecar };
}

export function generatedAssetView(cfg, resource) {
  const type = 'private';
  const publicId = resource.public_id;
  return {
    public_id: publicId,
    type,
    created_at: resource.created_at,
    width: resource.width,
    height: resource.height,
    bytes: resource.bytes,
    duration: resource.duration,
    published: false,
    folder: GENERATED_FOLDER,
    originals_folder: ORIGINALS_FOLDER,
    sidecar_public_id: sidecarPublicId(publicId),
    title: resource.context?.caption || resource.context?.custom?.caption || publicId.split('/').pop(),
    preview_url: deliveryUrl(cfg, { resourceType: 'video', type, publicId, ext: 'mp4', transformation: 'c_limit,w_1280,h_1280/q_auto' }),
    thumb_url: deliveryUrl(cfg, { resourceType: 'video', type, publicId, ext: 'jpg', transformation: 'so_1/c_fill,w_320,h_180/q_auto' }),
    tags: resource.tags || [],
  };
}

export async function listGeneratedClips(cfg, fetchImpl = fetch) {
  const result = await searchAssets(cfg, { expression: generatedSearchExpression(), maxResults: 40 }, fetchImpl);
  return (result.resources || [])
    .filter(r => isGeneratedPublicId(r.public_id))
    .map(r => generatedAssetView(cfg, r));
}

export async function openGeneratedClip(cfg, publicId, fetchImpl = fetch, now = Date.now()) {
  if (!isGeneratedPublicId(publicId)) {
    const error = new Error('Generated clips must live under satcom/generated/.');
    error.status = 400;
    error.expose = true;
    throw error;
  }
  const view = generatedAssetView(cfg, { public_id: publicId, type: 'private' });
  let sidecar = null;
  let sidecarCheck = { ok: false, missing: [], modelOk: false };
  try {
    const file = await fetchBytes(
      privateDownloadUrl(cfg, { publicId: sidecarPublicId(publicId), type: 'private' }, now),
      { maxBytes: 300_000 },
      fetchImpl,
    );
    sidecar = JSON.parse(file.bytes.toString('utf8'));
    sidecarCheck = validateSidecar(sidecar);
  } catch {
    sidecar = null;
  }
  return {
    ...view,
    sidecar: sidecarCheck.sidecar || sidecar,
    sidecar_raw: sidecar,
    sidecar_ok: sidecarCheck.ok,
    sidecar_missing: sidecarCheck.missing,
    note: sidecarCheck.ok
      ? 'Private Cloudinary draft. Nothing is published.'
      : 'Clip opened. Sidecar JSON is missing or incomplete; Patrick\'s queue should write the handoff fields.',
  };
}
