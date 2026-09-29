import { randomUUID } from 'node:crypto';
import { resolveModel } from './registry.js';
import { redact } from './redact.js';
import { estimateCost, usageFromInteraction } from './cost.js';
import { recordFailure } from './limits.js';
import {
  buildOmniPayload, buildNewsPrompt, getInteraction, startInteraction,
  downloadVideoBytes, findVideo, OMNI_BRANDS,
} from './omni.js';

const ACTIVE = new Set(['queued', 'submitting', 'running', 'downloading', 'uploading']);
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export function slugify(text, max = 60) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '') || 'clip';
}

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

export async function submitVideoJob(client, input) {
  const { registry, store, clock, env } = client;
  const brandKey = String(input.brand || '');
  const brand = OMNI_BRANDS[brandKey];
  if (!brand) throw fail(400, `Unknown brand '${brandKey}'.`);
  const headline = String(input.headline || '').replace(/\s+/g, ' ').trim();
  const script = String(input.script || '').replace(/\s+/g, ' ').trim();
  if (!headline) throw fail(400, 'headline is empty');
  const sentences = script.split(/(?<=[.!?])["')\]]*\s+/).filter(s => /\w/.test(s));
  if (sentences.length < 2 || sentences.length > 4) throw fail(400, `script must be 2-4 sentences; got ${sentences.length}.`);
  const aspect = input.aspect || '16:9';
  const town = String(input.town || brand.town).trim();
  const seconds = registry.omni.targetSeconds || 8;
  const resolution = registry.omni.defaultResolution || '1080p';
  const model = resolveModel(registry, 'video', input.model).model;
  const prompt = buildNewsPrompt({ brand: brand.name, town, headline, script, seconds });
  const payload = buildOmniPayload({ registry, prompt, aspect, resolution, apiDuration: input.apiDuration });
  const now = clock();
  const job = {
    id: input.id || randomUUID(),
    status: 'queued',
    model,
    prompt,
    brand: brandKey,
    headline,
    script,
    aspect_ratio: aspect,
    resolution,
    target_seconds: seconds,
    cloudinary_folder: registry.omni.cloudinaryFolder,
    sidecar: {
      requested: { resolution, aspect_ratio: aspect, target_duration_s: seconds, resolution_note: '1080p is upscaled (native default 720p).' },
      published: false,
      ai_generated: true,
    },
    created_at_ms: now,
    updated_at_ms: now,
    gemini_status: null,
  };
  await store.insertJob(job);
  // Submit the Omni interaction in this request (fast: background=true). Generation is polled later.
  try {
    await store.updateJob(job.id, { status: 'submitting', updated_at_ms: clock() });
    const interaction = await startInteraction(client, { payload });
    const next = await store.updateJob(job.id, {
      status: 'running',
      interaction_id: interaction.id,
      gemini_status: interaction.status || 'running',
      updated_at_ms: clock(),
    });
    return { job: next || { ...job, status: 'running', interaction_id: interaction.id }, interaction };
  } catch (error) {
    await store.updateJob(job.id, {
      status: 'failed',
      error_redacted: redact(error.message || 'submit failed', env),
      updated_at_ms: clock(),
    });
    throw error;
  }
}

export async function advanceJob(client, job, { upload } = {}) {
  const { registry, store, clock, env } = client;
  if (!job || TERMINAL.has(job.status)) return job;
  try {
    if (job.status === 'queued') {
      const payload = buildOmniPayload({
        registry,
        prompt: job.prompt,
        aspect: job.aspect_ratio,
        resolution: job.resolution,
      });
      await store.updateJob(job.id, { status: 'submitting', updated_at_ms: clock() });
      const interaction = await startInteraction(client, { payload });
      return store.updateJob(job.id, {
        status: 'running',
        interaction_id: interaction.id,
        gemini_status: interaction.status || 'running',
        updated_at_ms: clock(),
      });
    }
    if (job.status === 'submitting' || job.status === 'running') {
      if (!job.interaction_id) throw fail(502, 'Job is running without an interaction id.');
      const interaction = await getInteraction(client, job.interaction_id);
      const gStatus = interaction.status;
      if (!['completed', 'failed', 'cancelled', 'requires_action', 'incomplete'].includes(gStatus)) {
        return store.updateJob(job.id, { gemini_status: gStatus, updated_at_ms: clock() });
      }
      if (gStatus !== 'completed') {
        return store.updateJob(job.id, {
          status: 'failed',
          gemini_status: gStatus,
          error_redacted: redact(`interaction ended with status '${gStatus}'`, env),
          updated_at_ms: clock(),
        });
      }
      const video = findVideo(interaction);
      if (!video) {
        return store.updateJob(job.id, {
          status: 'failed',
          gemini_status: gStatus,
          error_redacted: 'interaction completed but no video was found',
          updated_at_ms: clock(),
        });
      }
      await store.updateJob(job.id, { status: 'downloading', gemini_status: gStatus, updated_at_ms: clock() });
      const bytes = await downloadVideoBytes(client, video);
      await store.updateJob(job.id, { status: 'uploading', updated_at_ms: clock() });
      const usage = usageFromInteraction(interaction);
      const cost = estimateCost(registry, {
        model: job.model,
        ...usage,
        videoSeconds: job.target_seconds,
        resolution: job.resolution,
      });
      const stamp = new Date(clock()).toISOString().slice(0, 10);
      const publicId = `${registry.omni.cloudinaryFolder}/${stamp}-${slugify(job.headline)}-${String(job.id).slice(0, 8)}`;
      const sidecar = {
        ...(job.sidecar || {}),
        model: job.model,
        model_returned_by_api: interaction.model || null,
        interaction_id: job.interaction_id,
        prompt: job.prompt,
        request_response_format: { type: 'video', aspect_ratio: job.aspect_ratio, resolution: job.resolution, delivery: registry.omni.delivery },
        requested: { resolution: job.resolution, aspect_ratio: job.aspect_ratio, target_duration_s: job.target_seconds, resolution_note: '1080p is upscaled by the API (native default is 720p).' },
        duration_s: job.target_seconds,
        resolution: job.resolution,
        aspect_ratio: job.aspect_ratio,
        generated_at: new Date(clock()).toISOString(),
        source: { brand_slug: job.brand, headline: job.headline, script: job.script },
        usage: interaction.usage || usage,
        estimated_usd: cost.estimatedUsd,
        ai_generated: true,
        synthid_note: registry.omni.synthidNote,
        published: false,
        cloudinary: { folder: registry.omni.cloudinaryFolder, public_id: publicId, type: 'private' },
      };
      if (typeof upload === 'function') {
        await upload({ bytes, publicId, sidecar, filename: `${slugify(job.headline)}.mp4` });
      } else {
        return store.updateJob(job.id, {
          status: 'failed',
          error_redacted: 'Cloudinary is not configured for private generated drafts.',
          updated_at_ms: clock(),
        });
      }
      return store.updateJob(job.id, {
        status: 'completed',
        cloudinary_public_id: publicId,
        estimated_usd: cost.estimatedUsd,
        sidecar,
        updated_at_ms: clock(),
      });
    }
    return job;
  } catch (error) {
    if (!error.status || error.status === 429 || error.status >= 500) {
      await recordFailure(store, registry, 'video', clock()).catch(() => {});
    }
    return store.updateJob(job.id, {
      status: ACTIVE.has(job.status) && /timed out/i.test(error.message || '') ? job.status : 'failed',
      error_redacted: redact(error.message || 'poll failed', env),
      updated_at_ms: clock(),
    });
  }
}

export async function pollVideoJobs(client, { limit = 8, upload } = {}) {
  const jobs = await client.store.listJobs({
    statuses: ['queued', 'submitting', 'running', 'downloading', 'uploading'],
    limit,
  });
  const results = [];
  for (const job of jobs) results.push(await advanceJob(client, job, { upload }));
  return results;
}

export { ACTIVE, TERMINAL };
