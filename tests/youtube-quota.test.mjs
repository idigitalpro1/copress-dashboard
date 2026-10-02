import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOGLE_QUOTA_DOC, GOOGLE_VIDEOS_INSERT_DAILY_LIMIT, GOOGLE_UNITS_DAILY_POOL,
  METHOD_COST, methodCost, editorialUploadCap, effectiveUploadCap,
  emptyQuota, normalizeQuota, quotaView, reserveUnits,
} from '../lib/video-studio/publish/quota.js';
import { DEFAULT_DAILY_UPLOAD_CAP } from '../lib/video-studio/publish/config.js';
import { createPublishMemoryStore } from '../lib/video-studio/publish/store.js';

test('Google quota model matches the 2026-09-15 calculator', () => {
  assert.equal(GOOGLE_QUOTA_DOC.url, 'https://developers.google.com/youtube/v3/determine_quota_cost');
  assert.equal(GOOGLE_QUOTA_DOC.updated, '2026-09-15');
  assert.equal(GOOGLE_VIDEOS_INSERT_DAILY_LIMIT, 100);
  assert.equal(GOOGLE_UNITS_DAILY_POOL, 10_000);
  assert.deepEqual(METHOD_COST['videos.insert'], { bucket: 'insert', units: 1 });
  assert.deepEqual(METHOD_COST['search.list'], { bucket: 'search', units: 1 });
  assert.deepEqual(methodCost('videos.update'), { bucket: 'units', units: 50 });
  assert.deepEqual(methodCost('videos.delete'), { bucket: 'units', units: 50 });
  assert.deepEqual(methodCost('thumbnails.set'), { bucket: 'units', units: 50 });
  assert.deepEqual(methodCost('playlistItems.insert'), { bucket: 'units', units: 50 });
  assert.deepEqual(methodCost('channels.list'), { bucket: 'units', units: 1 });
  assert.deepEqual(methodCost('unknown.method'), { bucket: 'units', units: 1 });
});

test('YOUTUBE_DAILY_UPLOAD_CAP default 6 is editorial and never exceeds Google insert bucket', () => {
  assert.equal(DEFAULT_DAILY_UPLOAD_CAP, 6);
  assert.equal(editorialUploadCap({}), 6);
  assert.equal(effectiveUploadCap({}), 6);
  assert.equal(effectiveUploadCap({ YOUTUBE_DAILY_UPLOAD_CAP: '1' }), 1);
  assert.equal(effectiveUploadCap({ YOUTUBE_DAILY_UPLOAD_CAP: '50' }), 50);
  assert.equal(effectiveUploadCap({ YOUTUBE_DAILY_UPLOAD_CAP: '100' }), 6);
  assert.ok(effectiveUploadCap({ YOUTUBE_DAILY_UPLOAD_CAP: '50' }) <= GOOGLE_VIDEOS_INSERT_DAILY_LIMIT);
});

test('quotaView reports insert bucket and units pool separately from the editorial cap', () => {
  const view = quotaView({ upload_count: 2, units_used: 51 }, {});
  assert.equal(view.used, 2);
  assert.equal(view.cap, 6);
  assert.equal(view.remaining, 4);
  assert.equal(view.editorial, true);
  assert.equal(view.editorial_cap, 6);
  assert.deepEqual(view.insert, { used: 2, limit: 100, remaining: 98 });
  assert.deepEqual(view.units, { used: 51, limit: 10_000, remaining: 9949 });
  assert.equal(view.doc.updated, '2026-09-15');
  assert.deepEqual(normalizeQuota(undefined, '2026-09-29'), emptyQuota('2026-09-29'));
});

test('reserveUnits charges the 10,000-unit pool and refuses when exhausted', async () => {
  const store = createPublishMemoryStore();
  const day = '2026-09-29';
  const first = await reserveUnits(store, day, 'videos.update');
  assert.equal(first.accepted, true);
  assert.equal(first.units_used, 50);
  assert.equal(first.upload_count, 0);
  await reserveUnits(store, day, 'channels.list');
  assert.equal((await store.getQuota(day)).units_used, 51);
  await store.incrementUnits(day, GOOGLE_UNITS_DAILY_POOL - 51);
  await assert.rejects(() => reserveUnits(store, day, 'videos.delete'), /units pool is exhausted/);
  await assert.rejects(() => reserveUnits(store, day, 'videos.insert'), /not charged to the 10,000-unit pool/);
  const quota = await store.getQuota(day);
  assert.equal(quota.upload_count, 0);
  assert.equal(quota.units_used, GOOGLE_UNITS_DAILY_POOL);
});
