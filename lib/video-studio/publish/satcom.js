import { videoSchema } from '../../video-feed.js';
import { uploadBytes } from '../cloudinary.js';
import { PUBLISHED_CATALOG_ID } from './config.js';
import { derivePublicDelivery, uploadPublicCaptions } from './public-delivery.js';
import { toVtt, parseCaptions } from '../captions.js';
import { publishedCatalogUrl, mergeCatalogs } from './overlay.js';

export { publishedCatalogUrl, readPublishedOverlay, mergeCatalogs } from './overlay.js';

export const SATCOM_ADAPTER_NOTE = `satcom.conews.press/video is served from this copress-dashboard repo (/video + GET /api/videos).
Approved clips are written to a public Cloudinary catalog overlay (satcom-studio/published/catalog.json) and merged into /api/videos at read time.
They are not committed to data/video-feed.json (that Git catalog still requires a reviewed PR).
No other repo needs a change for the overlay path. If a future connected catalog (VIDEO_FEED_URL) is the production source, point that URL at the Cloudinary catalog or merge these entries there — do not edit WordPress, DNS, or other sites.`;

function feedId(title, shootDate, publicId) {
  const slug = String(title).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'clip';
  const day = String(shootDate).replace(/-/g, '').slice(0, 8);
  const tail = String(publicId).split('/').pop().replace(/[^a-z0-9]+/gi, '-').slice(0, 24).toLowerCase();
  return `${slug}-${day}-${tail}`.replace(/-+/g, '-').slice(0, 100);
}

export function buildPublishedEntry({ gate, publicDelivery, vttUrl, source, now }) {
  const publishedAt = `${gate.shoot_date}T12:00:00.000Z`;
  const entry = {
    id: feedId(gate.title, gate.shoot_date, source.public_id),
    title: gate.title,
    description: gate.description,
    creator: 'paul-hill',
    credit: gate.credit_name,
    publications: ['network'],
    towns: [],
    published_at: Date.parse(publishedAt) ? publishedAt : new Date(now).toISOString(),
    status: 'published',
    kind: 'recorded',
    poster_url: publicDelivery.poster_url,
    playback: { type: 'mp4', url: publicDelivery.mp4_url },
    captions: vttUrl ? [{ url: vttUrl, language: 'en', label: 'English' }] : [],
  };
  return videoSchema.parse(entry);
}

async function readWriteCatalog(cfg, store, mutate, fetchImpl, now) {
  let catalog = { version: 1, items: [] };
  let overlayRead = false;
  let overlayError = false;
  try {
    const response = await fetchImpl(publishedCatalogUrl(cfg.cloudName), { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const json = await response.json();
      if (json?.version === 1 && Array.isArray(json.items)) {
        catalog = json;
        overlayRead = true;
      }
    } else if (response.status !== 404) {
      overlayError = true;
    }
  } catch {
    overlayError = true;
  }
  const stored = store?.listPublished ? await store.listPublished() : [];
  if (overlayError && !overlayRead && !stored.length && !catalog.items.length) {
    const error = new Error('Published catalog could not be read; refusing to overwrite.');
    error.status = 502;
    error.expose = true;
    throw error;
  }
  if (stored.length) catalog = mergeCatalogs(catalog, { version: 1, items: stored });
  catalog = mutate(catalog);
  await uploadBytes(cfg, {
    resourceType: 'raw',
    bytes: Buffer.from(JSON.stringify(catalog, null, 2)),
    filename: 'catalog.json',
    mime: 'application/json',
    params: { public_id: PUBLISHED_CATALOG_ID, type: 'upload', overwrite: 'true', tags: 'satcom-published,satcom-catalog' },
  }, fetchImpl, now);
  return catalog;
}

export function createSatcomAdapter({ cfg, store, fetchImpl, clock }) {
  return {
    id: 'satcom-conews-press-video',
    note: SATCOM_ADAPTER_NOTE,
    async publish({ gate, source, now = clock() }) {
      if (!cfg) {
        const error = new Error('Cloudinary is not configured; satcom.conews.press/video cannot derive a public delivery URL.');
        error.status = 503;
        error.expose = true;
        throw error;
      }
      const publicDelivery = await derivePublicDelivery(cfg, { source, now, fetchImpl });
      let vttUrl = null;
      if (gate.captions) {
        const cues = parseCaptions(gate.captions);
        if (cues.length) vttUrl = await uploadPublicCaptions(cfg, { vttText: toVtt(cues), publicId: publicDelivery.public_id }, fetchImpl, now);
      }
      const entry = buildPublishedEntry({ gate, publicDelivery, vttUrl, source, now });
      await store.upsertPublished(entry);
      await readWriteCatalog(cfg, store, catalog => {
        const items = catalog.items.filter(i => i.id !== entry.id);
        items.push({ ...entry, status: 'published' });
        return { version: 1, items };
      }, fetchImpl, now);
      return {
        satcom_entry_id: entry.id,
        public_playback_url: publicDelivery.mp4_url,
        poster_url: publicDelivery.poster_url,
        catalog_url: publishedCatalogUrl(cfg.cloudName),
        entry,
      };
    },
    async unpublish({ satcomEntryId, now = clock() }) {
      if (!satcomEntryId) return { removed: false };
      await store.removePublished(satcomEntryId);
      if (cfg) {
        await readWriteCatalog(cfg, store, catalog => ({
          version: 1,
          items: (catalog.items || []).filter(i => i.id !== satcomEntryId),
        }), fetchImpl, now);
      }
      return { removed: true };
    },
  };
}
