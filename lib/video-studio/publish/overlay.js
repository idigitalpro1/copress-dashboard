import { cloudinaryConfig } from '../cloudinary.js';
import { PUBLISHED_CATALOG_ID } from './config.js';

export function publishedCatalogUrl(cloudName) {
  return `https://res.cloudinary.com/${cloudName}/raw/upload/${PUBLISHED_CATALOG_ID}.json`;
}

export async function readPublishedOverlay(env, fetchImpl = fetch) {
  const explicit = env.VIDEO_PUBLISHED_CATALOG_URL;
  const cfg = cloudinaryConfig(env);
  const url = (typeof explicit === 'string' && explicit.startsWith('https://') && !explicit.includes('@'))
    ? explicit
    : (cfg ? publishedCatalogUrl(cfg.cloudName) : null);
  if (!url) return null;
  try {
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(3000), headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const json = await response.json();
    if (!json || json.version !== 1 || !Array.isArray(json.items) || json.items.length > 2000) return null;
    return json;
  } catch {
    return null;
  }
}

export function mergeCatalogs(base, overlay) {
  const items = Array.isArray(base?.items) ? [...base.items] : [];
  if (!overlay?.items?.length) return { version: 1, items };
  const byId = new Map(items.map(i => [i.id, i]));
  for (const item of overlay.items) {
    if (item?.id) byId.set(item.id, item);
  }
  return { version: 1, items: [...byId.values()] };
}
