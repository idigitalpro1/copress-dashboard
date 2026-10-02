import { deliveryUrl, searchAssets } from './cloudinary.js';

const INCOMING_ID = /^satcom\/[a-z0-9]+(?:-[a-z0-9]+)*\/incoming\/(?!.*\.\.)[A-Za-z0-9_][A-Za-z0-9_\-/.]{0,200}$/;

export function incomingFolder(slug) {
  return `satcom/${slug}/incoming`;
}

export function isIncomingPublicId(publicId) {
  return typeof publicId === 'string' && INCOMING_ID.test(publicId);
}

export function incomingSearchExpression() {
  return 'resource_type:video AND type:private AND tags=creator-upload';
}

export function incomingAssetView(cfg, resource) {
  const type = 'private';
  const publicId = resource.public_id;
  const context = resource.context?.custom || resource.context || {};
  return {
    public_id: publicId,
    type,
    created_at: resource.created_at,
    width: resource.width,
    height: resource.height,
    bytes: resource.bytes,
    duration: resource.duration,
    published: false,
    folder: publicId.split('/').slice(0, 3).join('/'),
    title: context.caption || resource.filename || publicId.split('/').pop(),
    creator: context.creator || '',
    note: context.note || '',
    uploaded_at: context.uploaded_at || resource.created_at || '',
    preview_url: deliveryUrl(cfg, { resourceType: 'video', type, publicId, ext: 'mp4', transformation: 'c_limit,w_1280,h_1280/q_auto' }),
    thumb_url: deliveryUrl(cfg, { resourceType: 'video', type, publicId, ext: 'jpg', transformation: 'so_1/c_fill,w_320,h_180/q_auto' }),
    tags: resource.tags || [],
  };
}

export async function listIncomingUploads(cfg, fetchImpl = fetch) {
  const result = await searchAssets(cfg, { expression: incomingSearchExpression(), maxResults: 40 }, fetchImpl);
  return (result.resources || [])
    .filter(r => isIncomingPublicId(r.public_id))
    .map(r => incomingAssetView(cfg, r));
}
