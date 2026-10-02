import { createHash } from 'node:crypto';

export function idempotencyKey(publicId, version, target) {
  return createHash('sha256').update(`${publicId}|${version}|${target}`).digest('hex');
}

export function contentVersion(payload) {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(canonical).digest('hex').slice(0, 24);
}

export function publishedPublicId(publicId) {
  const slug = String(publicId).split('/').filter(Boolean).join('--').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 180);
  return `satcom/published/${slug || 'clip'}`;
}
