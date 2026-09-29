import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { readPublishedOverlay, mergeCatalogs } from './video-studio/publish/overlay.js';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const httpsUrl = z.string().url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Use an HTTPS playback URL without credentials');
export const videoSchema = z.object({
  id: slug,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1000).default(''),
  creator: slug,
  credit: z.string().trim().min(1).max(200),
  publications: z.array(slug).min(1).max(30),
  towns: z.array(slug).max(30).default([]),
  published_at: z.string().datetime({ offset: true }),
  status: z.literal('published'),
  kind: z.enum(['recorded', 'live']).default('recorded'),
  // Provider/editor heartbeat. An old declaration must not remain LIVE forever.
  live_confirmed_at: z.string().datetime({ offset: true }).optional(),
  poster_url: httpsUrl.optional(),
  playback: z.discriminatedUnion('type', [
    z.object({ type: z.literal('mp4'), url: httpsUrl }),
    z.object({ type: z.literal('hls'), url: httpsUrl }),
    z.object({ type: z.literal('youtube'), video_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/) }),
  ]),
  captions: z.array(z.object({
    url: httpsUrl, language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/), label: z.string().max(80),
  })).max(10).default([]),
});

export function publicCatalog(raw, now = Date.now()) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.items) || raw.items.length > 2000) {
    throw new Error('Invalid catalog');
  }
  const ids = new Set();
  // Studio drafts carry status "draft" and published:false; either keeps an entry private.
  return raw.items.filter(item => item?.status === 'published' && item?.published !== false).map(item => {
    const video = videoSchema.parse(item);
    if (ids.has(video.id)) throw new Error('Duplicate video ID');
    ids.add(video.id);
    const confirmed = Date.parse(video.live_confirmed_at || '');
    const isLive = video.kind === 'live' && confirmed <= now && now - confirmed <= 120000;
    // This projection excludes draft metadata, raw uploads, credentials and internal fields.
    const { status, live_confirmed_at, ...publicVideo } = video;
    return { ...publicVideo, live_status: video.kind === 'recorded' ? 'recorded' : isLive ? 'live' : 'unconfirmed' };
  }).filter(video => Date.parse(video.published_at) <= now)
    .sort((a, b) => Number(b.live_status === 'live') - Number(a.live_status === 'live') || Date.parse(b.published_at) - Date.parse(a.published_at) || a.id.localeCompare(b.id));
}

export function feedQuery(params) {
  const filters = {};
  for (const key of ['creator', 'publication', 'town']) {
    if (params.has(key)) {
      if (params.getAll(key).length !== 1) throw new Error('Duplicate filter');
      filters[key] = slug.parse(params.get(key));
    }
  }
  const limit = params.get('limit') ?? '12';
  if (params.getAll('limit').length > 1 || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 50) throw new Error('Invalid limit');
  filters.limit = Number(limit);
  return filters;
}

export function filterVideos(items, { creator, publication, town, limit }) {
  return items.filter(item => (!creator || item.creator === creator)
    && (!publication || item.publications.includes(publication) || item.publications.includes('network'))
    && (!town || item.towns.includes(town))).slice(0, limit);
}

export async function readCatalog({ env = process.env, fetchImpl = fetch } = {}) {
  const overlay = await readPublishedOverlay(env, fetchImpl);
  if (!env.VIDEO_FEED_URL) {
    const git = JSON.parse(await readFile(new URL('../data/video-feed.json', import.meta.url), 'utf8'));
    const catalog = overlay ? mergeCatalogs(git, overlay) : git;
    return { catalog, source: overlay ? 'catalog+published' : 'catalog' };
  }
  // Only the operator-configured source is fetched. No request parameter can select an upstream.
  const url = new URL(httpsUrl.parse(env.VIDEO_FEED_URL));
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', ...(env.VIDEO_FEED_TOKEN ? { Authorization: `Bearer ${env.VIDEO_FEED_TOKEN}` } : {}) },
    redirect: 'error', signal: AbortSignal.timeout(5000),
  });
  if (!response.ok || !response.body) throw new Error('Feed unavailable');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2_000_000) { await reader.cancel(); throw new Error('Feed exceeds size limit'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  const connected = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const catalog = overlay ? mergeCatalogs(connected, overlay) : connected;
  return { catalog, source: overlay ? 'connected-feed+published' : 'connected-feed' };
}
