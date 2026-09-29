import { clampHours, randomToken, sha256Hex } from './crypto.js';
import { generateShortCode } from './codes.js';
import { parseReviewReply } from './parse-reply.js';
import { normalizePhone } from './phones.js';
import { nextStatusForDecision } from './transitions.js';
import {
  alreadyDecidedText,
  confirmationText,
  expiredText,
  helpText,
  needCodeText,
  nowLiveText,
  reviewRequestText,
  startText,
  stopText,
  unknownCodeText,
  unknownText,
} from './messages.js';
import { clipReceivedText, mmsVideoId, resolveCreator } from './creators.js';
import { firstVideoMedia, twilioAdvancedOptOut } from './sms.js';
import { pendingVideoPublic } from './catalog.js';

export function publicBaseUrl(env = process.env) {
  if (env.SATCOM_VIDEO_PUBLIC_URL) return String(env.SATCOM_VIDEO_PUBLIC_URL).replace(/\/$/, '');
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`.replace(/\/$/, '');
  return 'https://satcom.5280.menu';
}

export function magicLinkTtlMs(env = process.env) {
  return clampHours(env.SATCOM_VIDEO_MAGIC_LINK_TTL_HOURS, 24, 72, 48) * 3600_000;
}

export function codeTtlMs(env = process.env) {
  return clampHours(env.SATCOM_VIDEO_CODE_TTL_HOURS, 1, 72, 72) * 3600_000;
}

export async function issueMagicLink({ store, reviewer, env, now = Date.now() }) {
  const token = randomToken(32);
  await store.insertMagicLink({
    reviewer_id: reviewer.id,
    token_hash: sha256Hex(token),
    expires_at: new Date(now + magicLinkTtlMs(env)).toISOString(),
  });
  return `${publicBaseUrl(env)}/video/review-continue?token=${token}`;
}

export async function notifyReviewers({ store, sms, env, bodyFor, now = Date.now() }) {
  const reviewers = await store.listOptedInReviewers();
  const sent = [];
  for (const reviewer of reviewers) {
    if (await isPhoneOptedOut(store, reviewer.phone_e164)) continue;
    const link = await issueMagicLink({ store, reviewer, env, now });
    const body = bodyFor(link, reviewer);
    const result = await sms.send({ to: reviewer.phone_e164, body });
    await store.recordSms({
      provider: sms.name,
      provider_message_id: result.id,
      direction: 'outbound',
      to_phone: reviewer.phone_e164,
      body,
    });
    sent.push({ reviewerId: reviewer.id, dryRun: Boolean(result.dryRun), request: result.request || null });
  }
  return sent;
}

export async function notifyReviewRequested({ store, sms, env, video, now = Date.now() }) {
  return notifyReviewers({
    store, sms, env, now,
    bodyFor: link => reviewRequestText({ title: video.title, code: video.short_code, link }),
  });
}

export async function notifyPublished({ store, sms, env, video, now = Date.now() }) {
  const watchUrl = `${publicBaseUrl(env)}/video/embed?creator=${encodeURIComponent(video.creator || 'paul-hill')}`;
  return notifyReviewers({
    store, sms, env, now,
    bodyFor: link => nowLiveText({ title: video.title, watchUrl, link }),
  });
}

async function uniqueShortCode(store) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateShortCode();
    const existing = await store.getVideoByShortCode(code);
    if (!existing || !['submitted', 'pending_review'].includes(existing.status)) return code;
  }
  throw new Error('short_code_unavailable');
}

export async function submitForReview({ store, sms, env, video, now = Date.now() }) {
  const shortCode = video.short_code || await uniqueShortCode(store);
  const row = {
    ...video,
    status: 'pending_review',
    short_code: shortCode,
    submitted_at: video.submitted_at || new Date(now).toISOString(),
    review_requested_at: new Date(now).toISOString(),
    code_expires_at: new Date(now + codeTtlMs(env)).toISOString(),
    updated_at: new Date(now).toISOString(),
  };
  const created = await store.insertVideo(row);
  await store.audit({ actor_type: 'submitter', actor_id: 'editor', action: 'submitted', video_id: created.id, detail: { short_code: shortCode } });
  await notifyReviewRequested({ store, sms, env, video: created, now });
  return created;
}

export async function decidePendingVideo({ store, sms, env, videoId, decision, deciderId, reason, source, now = Date.now() }) {
  const status = nextStatusForDecision(decision);
  if (!status) return { ok: false, reason: 'invalid_decision' };
  const decided = await store.decideVideo({ id: videoId, status, deciderId, reason, source, now });
  if (!decided) return { ok: false, reason: 'not_pending' };
  await store.audit({
    actor_type: 'reviewer',
    actor_id: deciderId,
    action: status === 'published' ? 'approved' : 'rejected',
    video_id: decided.id,
    detail: { source, reason: reason || null },
  });
  if (status === 'published') await notifyPublished({ store, sms, env, video: decided, now });
  return { ok: true, video: decided };
}

async function resolveDecisionTarget(store, parsed, now) {
  if (parsed.code) {
    const video = await store.getVideoByShortCode(parsed.code);
    if (!video) return { error: 'unknown_code', code: parsed.code };
    if (video.code_expires_at && Date.parse(video.code_expires_at) <= now) return { error: 'expired', video };
    if (video.status !== 'pending_review') return { error: 'already_decided', video };
    return { video };
  }
  const pending = await store.listPendingVideos(now);
  if (pending.length !== 1) return { error: 'need_code', pending };
  return { video: pending[0] };
}

export async function isPhoneOptedOut(store, phone) {
  if (!phone) return true;
  try {
    const row = await store.getSmsOptOut?.(phone);
    if (row) return Boolean(row.opted_out);
  } catch {
    /* sms_opt_outs may be unapplied */
  }
  try {
    const reviewer = await store.getReviewerByPhone(phone);
    if (reviewer) return !reviewer.opted_in;
  } catch {
    /* ignore */
  }
  try {
    const creator = await store.getCreatorByPhone?.(phone);
    if (creator && creator.opted_in === false) return true;
  } catch {
    /* creators table may be unapplied */
  }
  return false;
}

async function recordOptOut(store, phone, optedOut, now) {
  try {
    await store.setSmsOptOut?.(phone, optedOut, now);
  } catch {
    /* optional table */
  }
}

function outboundMeta(result) {
  if (!result) return {};
  return {
    ...(result.dryRun ? { dryRun: true } : {}),
    ...(result.request ? { twilioRequest: result.request } : {}),
    ...(result.suppressed ? { suppressed: true } : {}),
  };
}

export async function ingestMmsVideo({ store, sms, env, inbound, creator, now = Date.now() }) {
  const media = firstVideoMedia(inbound.media);
  if (!media || !creator) return null;
  const id = mmsVideoId(creator.slug, inbound.messageId);
  const parsed = parseReviewReply(inbound.body);
  const title = parsed.type === 'unknown' && String(inbound.body || '').trim()
    ? String(inbound.body).trim().slice(0, 200)
    : `Video from ${creator.name}`;
  const video = {
    id,
    title,
    description: `Inbound MMS (${media.contentType || 'video'}). Twilio media URLs require authenticated fetch.`,
    creator: creator.slug,
    credit: creator.name,
    publications: ['network'],
    towns: [],
    kind: 'recorded',
    playback: {
      type: 'mp4',
      url: media.url,
      source: 'twilio-mms',
      content_type: media.contentType || 'video/*',
    },
    captions: [],
  };
  return submitForReview({ store, sms, env, video, now });
}

export async function handleInboundSms({ store, sms, env, headers, rawBody, now = Date.now() }) {
  const verified = sms.verifyInbound({ headers, rawBody, now });
  if (!verified.ok) return { status: 403, body: { error: 'invalid_signature' } };
  const inbound = sms.parseInbound({ headers, rawBody });
  if (!inbound || !inbound.messageId) return { status: 200, body: { ignored: true } };
  const recorded = await store.recordSms({
    provider: inbound.provider || sms.name,
    provider_message_id: inbound.messageId,
    direction: 'inbound',
    from_phone: inbound.from,
    to_phone: inbound.to,
    body: inbound.body,
  });
  if (!recorded.inserted) return { status: 200, body: { duplicate: true } };

  const parsed = parseReviewReply(inbound.body);
  const phone = normalizePhone(inbound.from);
  const skipKeywordReply = sms.name === 'twilio' && twilioAdvancedOptOut(env);

  const reply = async (body, { compliance = false } = {}) => {
    if (!compliance && await isPhoneOptedOut(store, inbound.from)) {
      return { id: `suppressed-${Date.now()}`, suppressed: true };
    }
    const result = await sms.send({ to: inbound.from, body });
    await store.recordSms({
      provider: sms.name,
      provider_message_id: result.id,
      direction: 'outbound',
      to_phone: inbound.from,
      body,
    });
    return result;
  };

  if (parsed.type === 'help') {
    let sent = null;
    if (!skipKeywordReply) sent = await reply(helpText(), { compliance: true });
    await store.audit({ actor_type: 'system', action: 'help', detail: { phone: Boolean(phone), advanced_opt_out: skipKeywordReply } });
    return { status: 200, body: { handled: 'help', skippedReply: skipKeywordReply, ...outboundMeta(sent) } };
  }

  if (parsed.type === 'stop') {
    const reviewer = phone ? await store.getReviewerByPhone(phone) : null;
    if (reviewer) await store.setReviewerOptIn(reviewer.id, false, now);
    if (phone) await recordOptOut(store, phone, true, now);
    let sent = null;
    if (!skipKeywordReply) sent = await reply(stopText(), { compliance: true });
    await store.audit({ actor_type: reviewer ? 'reviewer' : 'unknown', actor_id: reviewer?.id, action: 'opt_out' });
    return { status: 200, body: { handled: 'stop', skippedReply: skipKeywordReply, ...outboundMeta(sent) } };
  }

  if (parsed.type === 'start') {
    const reviewer = phone ? await store.getReviewerByPhone(phone) : null;
    const creator = await resolveCreator({ phone, env, store });
    if (!reviewer && !creator) {
      await store.audit({ actor_type: 'unknown', action: 'start_denied' });
      return { status: 200, body: { handled: 'start_denied' } };
    }
    if (reviewer) await store.setReviewerOptIn(reviewer.id, true, now);
    if (phone) await recordOptOut(store, phone, false, now);
    let sent = null;
    if (!skipKeywordReply) sent = await reply(startText(), { compliance: true });
    await store.audit({ actor_type: reviewer ? 'reviewer' : 'creator', actor_id: reviewer?.id, action: 'opt_in' });
    return { status: 200, body: { handled: 'start', skippedReply: skipKeywordReply, ...outboundMeta(sent) } };
  }

  const creator = await resolveCreator({ phone, env, store });
  const videoMedia = firstVideoMedia(inbound.media);
  if (videoMedia && creator) {
    const created = await ingestMmsVideo({ store, sms, env, inbound, creator, now });
    const confirmation = clipReceivedText(creator);
    const sent = await reply(confirmation);
    await store.audit({
      actor_type: 'creator',
      actor_id: creator.slug,
      action: 'mms_received',
      video_id: created.id,
      detail: { content_type: videoMedia.contentType || null },
    });
    return {
      status: 200,
      body: {
        handled: 'mms_received',
        id: created.id,
        status: created.status,
        confirmation,
        ...outboundMeta(sent),
      },
    };
  }

  const reviewer = phone ? await store.getReviewerByPhone(phone) : null;
  if (!reviewer) {
    await store.audit({ actor_type: 'unknown', action: 'sender_not_allowlisted' });
    return { status: 200, body: { handled: 'ignored' } };
  }
  if (!reviewer.opted_in || await isPhoneOptedOut(store, phone)) {
    await store.audit({ actor_type: 'reviewer', actor_id: reviewer.id, action: 'sender_opted_out' });
    return { status: 200, body: { handled: 'opted_out' } };
  }

  if (parsed.type !== 'decision') {
    const sent = await reply(unknownText());
    return { status: 200, body: { handled: 'unknown', ...outboundMeta(sent) } };
  }

  const target = await resolveDecisionTarget(store, parsed, now);
  if (target.error === 'unknown_code') {
    const sent = await reply(unknownCodeText(target.code));
    return { status: 200, body: { handled: 'unknown_code', ...outboundMeta(sent) } };
  }
  if (target.error === 'expired') {
    const sent = await reply(expiredText(target.video.short_code));
    return { status: 200, body: { handled: 'expired', ...outboundMeta(sent) } };
  }
  if (target.error === 'already_decided') {
    const sent = await reply(alreadyDecidedText(target.video));
    return { status: 200, body: { handled: 'already_decided', ...outboundMeta(sent) } };
  }
  if (target.error === 'need_code') {
    const sent = await reply(needCodeText(target.pending));
    return { status: 200, body: { handled: 'need_code', ...outboundMeta(sent) } };
  }

  const result = await decidePendingVideo({
    store, sms, env,
    videoId: target.video.id,
    decision: parsed.decision,
    deciderId: reviewer.id,
    reason: parsed.reason,
    source: 'sms',
    now,
  });
  if (!result.ok) {
    const sent = await reply(alreadyDecidedText(target.video));
    return { status: 200, body: { handled: 'already_decided', ...outboundMeta(sent) } };
  }
  const sent = await reply(confirmationText(result.video, result.video.status));
  return { status: 200, body: { handled: result.video.status, id: result.video.id, ...outboundMeta(sent) } };
}

export async function consumeMagicLink({ store, token, now = Date.now() }) {
  if (!token) return null;
  return store.consumeMagicLink({ tokenHash: sha256Hex(token), now });
}

export async function listPendingForReview(store, now = Date.now()) {
  const rows = await store.listPendingVideos(now);
  return rows.map(pendingVideoPublic);
}
