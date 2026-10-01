import { youtubeDailyCap } from './config.js';

// https://developers.google.com/youtube/v3/determine_quota_cost — last updated 2026-09-15 UTC.
// videos.insert and search.list each have their own daily bucket (default 100 calls, 1 unit/call).
// The 10,000 units/day pool covers every other endpoint. The old 1,600 units/upload figure is obsolete.
export const GOOGLE_QUOTA_DOC = {
  url: 'https://developers.google.com/youtube/v3/determine_quota_cost',
  updated: '2026-09-15',
};

export const GOOGLE_VIDEOS_INSERT_DAILY_LIMIT = 100;
export const GOOGLE_SEARCH_LIST_DAILY_LIMIT = 100;
export const GOOGLE_UNITS_DAILY_POOL = 10_000;

export const METHOD_COST = {
  'videos.insert': { bucket: 'insert', units: 1 },
  'search.list': { bucket: 'search', units: 1 },
  'videos.update': { bucket: 'units', units: 50 },
  'videos.delete': { bucket: 'units', units: 50 },
  'videos.list': { bucket: 'units', units: 1 },
  'videos.rate': { bucket: 'units', units: 50 },
  'videos.getRating': { bucket: 'units', units: 1 },
  'videos.reportAbuse': { bucket: 'units', units: 50 },
  'channels.list': { bucket: 'units', units: 1 },
  'channels.update': { bucket: 'units', units: 50 },
  'thumbnails.set': { bucket: 'units', units: 50 },
  'playlistItems.insert': { bucket: 'units', units: 50 },
  'playlistItems.update': { bucket: 'units', units: 50 },
  'playlistItems.delete': { bucket: 'units', units: 50 },
  'playlistItems.list': { bucket: 'units', units: 1 },
  'playlists.insert': { bucket: 'units', units: 50 },
  'playlists.update': { bucket: 'units', units: 50 },
  'playlists.delete': { bucket: 'units', units: 50 },
  'playlists.list': { bucket: 'units', units: 1 },
};

export function emptyQuota(day) {
  return { day, upload_count: 0, units_used: 0 };
}

export function normalizeQuota(row, day) {
  return {
    day: row?.day || day,
    upload_count: Number(row?.upload_count) || 0,
    units_used: Number(row?.units_used) || 0,
    cap: row?.cap,
  };
}

export function methodCost(method) {
  return METHOD_COST[method] || { bucket: 'units', units: 1 };
}

export function editorialUploadCap(env = {}) {
  return youtubeDailyCap(env);
}

export function effectiveUploadCap(env = {}) {
  return Math.min(editorialUploadCap(env), GOOGLE_VIDEOS_INSERT_DAILY_LIMIT);
}

export function quotaView(row, env = {}) {
  const q = normalizeQuota(row);
  const cap = effectiveUploadCap(env);
  const insertLimit = GOOGLE_VIDEOS_INSERT_DAILY_LIMIT;
  const unitsLimit = GOOGLE_UNITS_DAILY_POOL;
  return {
    used: q.upload_count,
    cap,
    remaining: Math.max(0, cap - q.upload_count),
    editorial_cap: editorialUploadCap(env),
    editorial: true,
    insert: {
      used: q.upload_count,
      limit: insertLimit,
      remaining: Math.max(0, insertLimit - q.upload_count),
    },
    units: {
      used: q.units_used,
      limit: unitsLimit,
      remaining: Math.max(0, unitsLimit - q.units_used),
    },
    doc: GOOGLE_QUOTA_DOC,
  };
}

export async function reserveUnits(store, day, method) {
  const spec = methodCost(method);
  if (spec.bucket !== 'units') {
    throw new Error(`${method} is not charged to the 10,000-unit pool.`);
  }
  if (typeof store?.incrementUnits !== 'function') {
    throw Object.assign(new Error('YouTube units accounting is unavailable.'), { status: 429, expose: true });
  }
  const result = await store.incrementUnits(day, spec.units, GOOGLE_UNITS_DAILY_POOL);
  if (!result?.accepted) {
    throw Object.assign(new Error(
      'YouTube Data API units pool is exhausted for today. Privacy updates, deletes and other non-upload calls are paused until tomorrow.',
    ), { status: 429, expose: true });
  }
  return result;
}
