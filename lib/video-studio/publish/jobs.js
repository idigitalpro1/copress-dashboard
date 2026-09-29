import { TARGETS, youtubeDailyCap, utcDay, nextUtcMidnight } from './config.js';
import { idempotencyKey } from './ids.js';
import { fetchVideoBytes } from './public-delivery.js';
import { accessToken, resumableUpload, updateVideoPrivacy, deleteVideo, videoResource } from './youtube.js';
import { createSatcomAdapter } from './satcom.js';

const IN_FLIGHT_MS = 10 * 60_000;

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

function jobView(job) {
  if (!job) return null;
  return {
    idempotency_key: job.idempotency_key,
    asset_public_id: job.asset_public_id,
    version: job.version,
    target: job.target,
    status: job.status,
    youtube_video_id: job.youtube_video_id || null,
    satcom_entry_id: job.satcom_entry_id || null,
    public_playback_url: job.public_playback_url || null,
    error: job.error || null,
    run_after: job.run_after_ms ? new Date(job.run_after_ms).toISOString() : null,
  };
}

async function ensureJobs(store, { publicId, version, now }) {
  const jobs = [];
  for (const target of TARGETS) {
    const key = idempotencyKey(publicId, version, target);
    let job = await store.getJob(key);
    if (!job) {
      job = await store.upsertJob({
        idempotency_key: key,
        asset_public_id: publicId,
        version,
        target,
        status: 'pending',
        updated_at_ms: now,
      });
    }
    jobs.push(job);
  }
  return jobs;
}

function snapshotGate(gate) {
  return {
    title: gate.title,
    description: gate.description,
    tags: gate.tags,
    contains_synthetic_media: gate.contains_synthetic_media,
    captions: gate.captions || '',
    credit_name: gate.credit_name,
    shoot_date: gate.shoot_date,
  };
}

export function isInFlight(job, now) {
  if (!job || job.status !== 'uploading') return false;
  const started = Number(job.updated_at_ms) || 0;
  return started > 0 && now - started < IN_FLIGHT_MS;
}

function wasDeleted(job) {
  return job?.result?.unpublish_mode === 'delete';
}

async function reuseExistingYoutube({ env, store, fetchImpl, clock, job, privacy }) {
  if (!job.youtube_video_id || wasDeleted(job)) return null;
  const now = clock();
  if (job.status === 'unpublished') {
    const { token } = await accessToken(env, store, fetchImpl, now);
    await updateVideoPrivacy(token, job.youtube_video_id, privacy, fetchImpl);
    const done = await store.upsertJob({
      ...job,
      status: 'succeeded',
      error: null,
      updated_at_ms: now,
      result: { ...(job.result || {}), privacy, restored: true, unpublish_mode: null },
    });
    await store.insertAudit({
      action: 'publish',
      target: 'youtube',
      asset_public_id: job.asset_public_id,
      status: 'succeeded',
      metadata: { youtube_video_id: job.youtube_video_id, restored: true },
    });
    return done;
  }
  if (job.status !== 'succeeded') {
    return store.upsertJob({
      ...job,
      status: 'succeeded',
      error: null,
      run_after_ms: null,
      updated_at_ms: now,
    });
  }
  return job;
}

async function queueForTomorrow(store, job, gate, source, privacy, now, env) {
  const runAfter = nextUtcMidnight(now);
  const queued = await store.upsertJob({
    ...job,
    status: 'queued',
    error: 'queued until tomorrow',
    run_after_ms: runAfter,
    updated_at_ms: now,
    result: { gate: snapshotGate(gate), source: { public_id: source.public_id, type: source.type }, privacy },
  });
  await store.insertAudit({
    action: 'quota_queue',
    target: 'youtube',
    asset_public_id: job.asset_public_id,
    job_id: null,
    status: 'queued',
    metadata: { day: utcDay(now), cap: youtubeDailyCap(env) },
  });
  return queued;
}

async function runYoutubeJob({ env, store, cfg, fetchImpl, clock, job, gate, source, privacy }) {
  const now = clock();
  if (job.status === 'succeeded') return job;
  const reused = await reuseExistingYoutube({ env, store, fetchImpl, clock, job, privacy });
  if (reused) return reused;
  if (isInFlight(job, now)) return job;

  const cap = youtubeDailyCap(env);
  const day = utcDay(now);
  const quota = await store.getQuota(day);
  if ((Number(quota.upload_count) || 0) >= cap) {
    return queueForTomorrow(store, job, gate, source, privacy, now, env);
  }

  const locked = await store.upsertJob({
    ...job,
    status: 'uploading',
    error: null,
    updated_at_ms: now,
    result: { gate: snapshotGate(gate), source: { public_id: source.public_id, type: source.type }, privacy },
  });

  try {
    const { token } = await accessToken(env, store, fetchImpl, now);
    const { bytes } = await fetchVideoBytes(cfg, source, fetchImpl);
    const uploaded = await resumableUpload(env, {
      accessToken: token,
      bytes,
      resource: videoResource({
        title: gate.title,
        description: gate.description,
        tags: gate.tags,
        privacyStatus: privacy,
        containsSyntheticMedia: gate.contains_synthetic_media,
      }),
    }, fetchImpl);
    const recorded = await store.upsertJob({
      ...locked,
      status: 'succeeded',
      youtube_video_id: uploaded.video_id,
      error: null,
      run_after_ms: null,
      updated_at_ms: clock(),
      result: { privacy: uploaded.privacyStatus || privacy },
    });
    await store.incrementQuota(day, cap);
    await store.insertAudit({ action: 'publish', target: 'youtube', asset_public_id: job.asset_public_id, status: 'succeeded', metadata: { youtube_video_id: uploaded.video_id } });
    return recorded;
  } catch (error) {
    const failed = await store.upsertJob({
      ...locked, status: 'failed', error: String(error.message || 'YouTube publish failed').slice(0, 300), updated_at_ms: clock(),
    });
    await store.insertAudit({ action: 'publish', target: 'youtube', asset_public_id: job.asset_public_id, status: 'failed' });
    return failed;
  }
}

async function runSatcomJob({ env, store, cfg, fetchImpl, clock, job, gate, source }) {
  const now = clock();
  if (job.status === 'succeeded') return job;
  try {
    const adapter = createSatcomAdapter({ cfg, store, fetchImpl, clock });
    const result = await adapter.publish({ gate, source, now });
    const done = await store.upsertJob({
      ...job,
      status: 'succeeded',
      satcom_entry_id: result.satcom_entry_id,
      public_playback_url: result.public_playback_url,
      error: null,
      updated_at_ms: now,
    });
    await store.insertAudit({ action: 'publish', target: 'satcom', asset_public_id: job.asset_public_id, status: 'succeeded', metadata: { satcom_entry_id: result.satcom_entry_id } });
    return done;
  } catch (error) {
    const failed = await store.upsertJob({
      ...job, status: 'failed', error: String(error.message || 'satcom publish failed').slice(0, 300), updated_at_ms: now,
    });
    await store.insertAudit({ action: 'publish', target: 'satcom', asset_public_id: job.asset_public_id, status: 'failed' });
    return failed;
  }
}

export async function runTarget({ env, store, cfg, fetchImpl, clock, job, gate, source, privacy }) {
  if (job.status === 'succeeded') return job;
  if (job.target === 'youtube') return runYoutubeJob({ env, store, cfg, fetchImpl, clock, job, gate, source, privacy });
  if (job.target === 'satcom') return runSatcomJob({ env, store, cfg, fetchImpl, clock, job, gate, source });
  throw fail(400, 'Unknown publish target.');
}

export async function approvePublish({ env, store, cfg, fetchImpl, clock, gate, source, version, privacy }) {
  const now = clock();
  const jobs = await ensureJobs(store, { publicId: source.public_id, version, now });
  const ran = [];
  for (const job of jobs) {
    if (job.status === 'succeeded') {
      ran.push(job);
      continue;
    }
    if (job.target === 'youtube' && isInFlight(job, now) && !job.youtube_video_id) {
      ran.push(job);
      continue;
    }
    ran.push(await runTarget({ env, store, cfg, fetchImpl, clock, job, gate, source, privacy }));
  }
  return ran.map(jobView);
}

export async function retryTarget({ env, store, cfg, fetchImpl, clock, publicId, version, target, gate, source, privacy }) {
  if (!TARGETS.includes(target)) throw fail(400, 'Unknown publish target.');
  const key = idempotencyKey(publicId, version, target);
  const job = await store.getJob(key);
  if (!job) throw fail(404, 'No publish job for that target.');
  if (job.status === 'succeeded') return jobView(job);
  if (target === 'youtube' && isInFlight(job, clock()) && !job.youtube_video_id) return jobView(job);
  if (target === 'youtube' && job.youtube_video_id && !wasDeleted(job)) {
    return jobView(await runTarget({ env, store, cfg, fetchImpl, clock, job, gate, source, privacy }));
  }
  const pending = await store.upsertJob({ ...job, status: 'pending', error: null, updated_at_ms: clock() });
  return jobView(await runTarget({ env, store, cfg, fetchImpl, clock, job: pending, gate, source, privacy }));
}

export async function unpublishTarget({ env, store, cfg, fetchImpl, clock, publicId, version, target, mode = 'private' }) {
  if (!TARGETS.includes(target)) throw fail(400, 'Unknown publish target.');
  const key = idempotencyKey(publicId, version, target);
  const job = await store.getJob(key);
  if (!job) throw fail(404, 'No publish job for that target.');
  const now = clock();
  if (target === 'youtube') {
    if (job.youtube_video_id) {
      const { token } = await accessToken(env, store, fetchImpl, now);
      if (mode === 'delete') await deleteVideo(token, job.youtube_video_id, fetchImpl);
      else await updateVideoPrivacy(token, job.youtube_video_id, 'private', fetchImpl);
    }
  } else {
    const adapter = createSatcomAdapter({ cfg, store, fetchImpl, clock });
    await adapter.unpublish({ satcomEntryId: job.satcom_entry_id, now });
  }
  const done = await store.upsertJob({
    ...job,
    status: 'unpublished',
    youtube_video_id: target === 'youtube' && mode === 'delete' ? null : job.youtube_video_id,
    updated_at_ms: now,
    result: { ...(job.result || {}), unpublish_mode: mode },
  });
  await store.insertAudit({ action: 'unpublish', target, asset_public_id: publicId, status: 'unpublished', metadata: { mode } });
  return jobView(done);
}

export async function drainYoutubeQueue({ env, store, cfg, fetchImpl, clock, gateForJob }) {
  const now = clock();
  const queued = await store.listQueuedYoutube(now);
  const out = [];
  for (const job of queued) {
    const ctx = gateForJob?.(job) || (job.result?.gate && job.result?.source
      ? { gate: job.result.gate, source: job.result.source, privacy: job.result.privacy }
      : null);
    if (!ctx) continue;
    out.push(await runYoutubeJob({ env, store, cfg, fetchImpl, clock, job, gate: ctx.gate, source: ctx.source, privacy: ctx.privacy }));
  }
  return out.map(jobView);
}

export { jobView };
