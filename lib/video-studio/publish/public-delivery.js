import { deliveryUrl, uploadBytes, fetchBytes, STUDIO_FOLDER } from '../cloudinary.js';
import { PUBLISHED_FOLDER } from './config.js';
import { publishedPublicId } from './ids.js';

// Drafts stay private/authenticated. A public type=upload copy is created only at publish time.
export async function derivePublicDelivery(cfg, { source, now, fetchImpl }) {
  const publicId = publishedPublicId(source.public_id);
  const signed = deliveryUrl(cfg, {
    resourceType: 'video', type: source.type, publicId: source.public_id, ext: 'mp4',
    transformation: 'q_auto',
  });
  const copy = await uploadBytes(cfg, {
    resourceType: 'video',
    fileUrl: signed,
    filename: `${publicId.split('/').pop()}.mp4`,
    mime: 'video/mp4',
    timeoutMs: 50000,
    params: {
      public_id: publicId,
      type: 'upload',
      overwrite: 'true',
      folder: undefined,
      tags: 'satcom-published,satcom-video',
    },
  }, fetchImpl, now);
  const id = copy.public_id || publicId;
  const mp4 = `https://res.cloudinary.com/${cfg.cloudName}/video/upload/${id}.mp4`;
  const poster = `https://res.cloudinary.com/${cfg.cloudName}/video/upload/so_1/${id}.jpg`;
  return { public_id: id, folder: PUBLISHED_FOLDER, mp4_url: mp4, poster_url: poster, type: 'upload' };
}

export async function uploadPublicCaptions(cfg, { vttText, publicId }, fetchImpl, now) {
  if (!vttText) return null;
  const id = `${STUDIO_FOLDER}/published/${publicId.split('/').pop()}.vtt`;
  await uploadBytes(cfg, {
    resourceType: 'raw',
    bytes: Buffer.from(vttText),
    filename: 'captions.vtt',
    mime: 'text/vtt',
    params: { public_id: id, type: 'upload', overwrite: 'true', tags: 'satcom-published,captions' },
  }, fetchImpl, now);
  return `https://res.cloudinary.com/${cfg.cloudName}/raw/upload/${id}`;
}

export async function fetchVideoBytes(cfg, source, fetchImpl, { maxBytes = 80_000_000, timeoutMs = 45000 } = {}) {
  const url = deliveryUrl(cfg, {
    resourceType: 'video', type: source.type, publicId: source.public_id, ext: 'mp4',
    transformation: 'q_auto',
  });
  return fetchBytes(url, { maxBytes, timeoutMs }, fetchImpl);
}
