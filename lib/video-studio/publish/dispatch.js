import { z } from 'zod';
import { sourceSchema } from '../edit.js';
import { evaluateGate, originalFromSidecar } from './gate.js';
import {
  publishFeatureEnabled, publishFlags, youtubeDefaultPrivacy,
  youtubeRedirectUri, utcDay, nextUtcMidnight, AI_DISCLOSURE_LINE, youtubeEnvConfigured,
} from './config.js';
import { emptyQuota, effectiveUploadCap, quotaView } from './quota.js';
import { classifyPublishStoreError } from './store.js';
import { SATCOM_ADAPTER_NOTE } from './satcom.js';
import { contentVersion } from './ids.js';
import { previewPlayers } from './preview.js';
import { approvePublish, retryTarget, unpublishTarget, jobView, drainYoutubeQueue } from './jobs.js';
import { oauthAuthorizeUrl, signOauthState, loadTokens } from './youtube.js';

function fail(status, message) { return Object.assign(new Error(message), { status, expose: true }); }

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw fail(400, `${issue.path.join('.') || 'request'}: ${issue.message}`);
  }
  return result.data;
}

export async function publishStatusPayload({ env, store, cfg, clock, fetchImpl }) {
  const flags = publishFlags(env);
  const now = clock();
  let connected = false;
  let channel_title = null;
  if (flags.youtube && store) {
    const loaded = await loadTokens(env, store).catch(() => null);
    connected = Boolean(loaded?.tokens?.refresh_token);
    channel_title = loaded?.channel_title || null;
  }
  const cap = effectiveUploadCap(env);
  let quota = emptyQuota(utcDay(now));
  let storeReason = store?.degraded || null;
  if (store) {
    try {
      quota = await store.getQuota(utcDay(now));
      storeReason = store.degraded || storeReason;
    } catch (error) {
      storeReason = store?.degraded || classifyPublishStoreError(error);
    }
  }
  const storeStatus = {
    kind: storeReason ? (store?.kind || 'memory') : (store?.kind || 'none'),
    ready: !storeReason,
    reason: storeReason,
  };
  let view = quotaView(quota, env);
  let queuedUntil = view.remaining === 0 ? new Date(nextUtcMidnight(now)).toISOString() : null;
  const notes = [...flags.notes];
  if (storeStatus.reason === 'migrations_not_applied') {
    notes.push('Supabase publish tables are missing (migrations not applied). Studio is using an in-memory + cookie fallback so this page still loads. Apply supabase/migrations/ on Preview before relying on durable jobs.');
  } else if (storeStatus.reason === 'store_unavailable') {
    notes.push('The publish store is unavailable. Studio is using an in-memory + cookie fallback.');
  } else if (flags.youtube && (storeStatus.kind === 'memory' || storeStatus.kind === 'memory+cookie')) {
    notes.push('YouTube tokens persist in a signed HttpOnly cookie until Supabase migrations are applied. Jobs and quota are per-instance only.');
  }
  if (flags.youtube && !connected) notes.push('YouTube OAuth env is set, but no channel is connected yet. Use Connect YouTube channel (one-time).');
  let drained = [];
  if (flags.youtube && connected && store && cfg && view.remaining > 0 && fetchImpl) {
    try {
      drained = await drainYoutubeQueue({ env, store, cfg, fetchImpl, clock });
      if (drained.length) {
        view = quotaView(await store.getQuota(utcDay(now)), env);
        queuedUntil = view.remaining === 0 ? new Date(nextUtcMidnight(now)).toISOString() : null;
      }
    } catch { /* boot must not fail if a queued upload errors */ }
  }
  if (queuedUntil) {
    notes.push(`Editorial YouTube upload cap reached (${cap}/day; our choice, not a Google limit). Further uploads are queued until tomorrow.`);
  }
  return {
    publish: flags.publish,
    youtube: flags.youtube,
    youtube_connected: connected,
    satcom: flags.satcom,
    channel_title,
    redirect_uri: flags.youtube ? youtubeRedirectUri(env) : null,
    default_privacy: youtubeDefaultPrivacy(env),
    quota: { ...view, queued_until: queuedUntil },
    store: storeStatus,
    ai_disclosure_line: AI_DISCLOSURE_LINE,
    satcom_note: SATCOM_ADAPTER_NOTE,
    notes,
    cloud_name: cfg?.cloudName || null,
    ...(drained.length ? { drained } : {}),
  };
}

function reviewPayload(body) {
  return {
    title: body.title,
    description: body.description,
    tags: body.tags || [],
    captions: body.captions || '',
    credit_name: body.credit_name,
    shoot_date: body.shoot_date,
    review: body.review,
    consent: body.consent,
    contains_synthetic_media: body.contains_synthetic_media,
    youtube_privacy: body.youtube_privacy,
    asset_tags: body.asset_tags || body.tags_on_asset || [],
  };
}

function privacyFor(env, gate, requested) {
  const fallback = youtubeDefaultPrivacy(env);
  const v = requested || gate.youtube_privacy || fallback;
  if (v === 'public' || v === 'private' || v === 'unlisted') return v;
  return fallback;
}

export async function dispatchPublish(op, body, ctx) {
  const PUBLISH_OPS = new Set([
    'publish-status', 'publish-preview', 'publish-evaluate',
    'youtube-oauth-start', 'youtube-disconnect', 'publish-jobs',
    'publish-approve', 'publish-retry', 'publish-unpublish',
  ]);
  if (!PUBLISH_OPS.has(op)) return null;

  const { env, store, cfg, fetchImpl, clock, session } = ctx;
  const enabled = publishFeatureEnabled(env);

  if (op === 'publish-status') {
    return publishStatusPayload({ env, store, cfg, clock, fetchImpl });
  }

  if (op === 'publish-preview') {
    if (!cfg) throw fail(503, 'Cloudinary is not configured.');
    const source = parse(sourceSchema, body.source);
    const draft = body.draft ? parse(sourceSchema, body.draft) : source;
    const sidecar = body.sidecar && typeof body.sidecar === 'object' ? body.sidecar : {};
    const tags = Array.isArray(body.asset_tags) ? body.asset_tags : [];
    return previewPlayers(cfg, { source, sidecar, draft, tags });
  }

  if (op === 'publish-evaluate') {
    const sidecar = body.sidecar && typeof body.sidecar === 'object' ? body.sidecar : {};
    const gate = evaluateGate(reviewPayload(body), { sidecar });
    return {
      ...gate,
      original: originalFromSidecar(sidecar),
      feature_enabled: enabled,
      blocked: !gate.ok || !enabled,
      blocked_reason: !enabled ? 'not_connected' : (gate.ok ? null : 'gate'),
    };
  }

  if (op === 'youtube-oauth-start') {
    if (!youtubeEnvConfigured(env)) throw fail(503, 'YouTube is not connected. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and YOUTUBE_TOKEN_ENC_KEY.');
    const state = signOauthState(env, clock(), session);
    return { url: oauthAuthorizeUrl(env, state), state, redirect_uri: youtubeRedirectUri(env) };
  }

  if (op === 'youtube-disconnect') {
    if (!enabled) throw fail(503, 'YouTube is not connected.');
    await store.clearYoutubeToken();
    await store.insertAudit({ action: 'oauth_disconnect', target: 'youtube', status: 'ok' });
    return { ok: true };
  }

  if (op === 'publish-jobs') {
    const publicId = parse(z.string().min(1).max(255), body.public_id);
    const jobs = await store.listJobs(publicId);
    return { jobs: jobs.map(jobView) };
  }

  if (!enabled) throw fail(503, 'Publishing is disabled. YouTube OAuth env vars are not set (see docs/youtube.md).');

  const source = parse(sourceSchema, body.source);
  const sidecar = body.sidecar && typeof body.sidecar === 'object' ? body.sidecar : {};
  const gate = evaluateGate(reviewPayload(body), { sidecar });
  if (['publish-approve', 'publish-retry'].includes(op) && !gate.ok) {
    throw fail(400, gate.issues[0] || 'Review gate blocked publishing.');
  }
  const version = body.version || contentVersion({
    public_id: source.public_id,
    title: gate.title,
    description: gate.description,
    shoot_date: gate.shoot_date,
    credit_name: gate.credit_name,
  });
  const privacy = privacyFor(env, gate, body.youtube_privacy);

  if (op === 'publish-approve') {
    const loaded = await loadTokens(env, store);
    if (!loaded?.tokens?.refresh_token) throw fail(503, 'Connect the YouTube channel before approving a publish.');
    await store.saveReview({
      asset_public_id: source.public_id,
      version,
      review: gate.review,
      consent: gate.consent,
      contains_synthetic_media: gate.contains_synthetic_media,
      youtube_privacy: privacy,
      shoot_date: gate.shoot_date,
    });
    const jobs = await approvePublish({ env, store, cfg, fetchImpl, clock, gate, source, version, privacy });
    return { version, jobs, contains_synthetic_media: gate.contains_synthetic_media, description: gate.description };
  }

  if (op === 'publish-retry') {
    const target = parse(z.enum(['youtube', 'satcom']), body.target);
    const job = await retryTarget({
      env, store, cfg, fetchImpl, clock,
      publicId: source.public_id, version: parse(z.string().min(8).max(64), body.version || version),
      target, gate, source, privacy,
    });
    return { version, job };
  }

  if (op === 'publish-unpublish') {
    const target = parse(z.enum(['youtube', 'satcom']), body.target);
    const mode = body.mode === 'delete' ? 'delete' : 'private';
    const job = await unpublishTarget({
      env, store, cfg, fetchImpl, clock,
      publicId: source.public_id,
      version: parse(z.string().min(8).max(64), body.version || version),
      target, mode,
    });
    return { job };
  }

  return null;
}
