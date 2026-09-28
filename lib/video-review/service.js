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
  return `${publicBaseUrl(env)}/video/review/continue?token=${token}`;
}

export async function notifyReviewers({ store, sms, env, bodyFor, now = Date.now() }) {
  const reviewers = await store.listOptedInReviewers();
  const sent = [];
  for (const reviewer of reviewers) {
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
    sent.push({ reviewerId: reviewer.id, dryRun: Boolean(result.dryRun) });
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

export async function handleInboundSms({ store, sms, env, headers, rawBody, now = Date.now() }) {
  const verified = sms.verifyInbound({ headers, rawBody, now });
  if (!verified.ok) return { status: 401, body: { error: 'invalid_signature' } };
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

  const reply = async body => {
    const result = await sms.send({ to: inbound.from, body });
    await store.recordSms({
      provider: sms.name,
      provider_message_id: result.id,
      direction: 'outbound',
      to_phone: inbound.from,
      body,
    });
  };

  if (parsed.type === 'help') {
    await reply(helpText());
    await store.audit({ actor_type: 'system', action: 'help', detail: { phone: Boolean(phone) } });
    return { status: 200, body: { handled: 'help' } };
  }

  if (parsed.type === 'stop') {
    const reviewer = phone ? await store.getReviewerByPhone(phone) : null;
    if (reviewer) await store.setReviewerOptIn(reviewer.id, false, now);
    await reply(stopText());
    await store.audit({ actor_type: reviewer ? 'reviewer' : 'unknown', actor_id: reviewer?.id, action: 'opt_out' });
    return { status: 200, body: { handled: 'stop' } };
  }

  if (parsed.type === 'start') {
    const reviewer = phone ? await store.getReviewerByPhone(phone) : null;
    if (!reviewer) {
      await store.audit({ actor_type: 'unknown', action: 'start_denied' });
      return { status: 200, body: { handled: 'start_denied' } };
    }
    await store.setReviewerOptIn(reviewer.id, true, now);
    await reply(startText());
    await store.audit({ actor_type: 'reviewer', actor_id: reviewer.id, action: 'opt_in' });
    return { status: 200, body: { handled: 'start' } };
  }

  const reviewer = phone ? await store.getReviewerByPhone(phone) : null;
  if (!reviewer) {
    await store.audit({ actor_type: 'unknown', action: 'sender_not_allowlisted' });
    return { status: 200, body: { handled: 'ignored' } };
  }
  if (!reviewer.opted_in) {
    await store.audit({ actor_type: 'reviewer', actor_id: reviewer.id, action: 'sender_opted_out' });
    return { status: 200, body: { handled: 'opted_out' } };
  }

  if (parsed.type !== 'decision') {
    await reply(unknownText());
    return { status: 200, body: { handled: 'unknown' } };
  }

  const target = await resolveDecisionTarget(store, parsed, now);
  if (target.error === 'unknown_code') {
    await reply(unknownCodeText(target.code));
    return { status: 200, body: { handled: 'unknown_code' } };
  }
  if (target.error === 'expired') {
    await reply(expiredText(target.video.short_code));
    return { status: 200, body: { handled: 'expired' } };
  }
  if (target.error === 'already_decided') {
    await reply(alreadyDecidedText(target.video));
    return { status: 200, body: { handled: 'already_decided' } };
  }
  if (target.error === 'need_code') {
    await reply(needCodeText(target.pending));
    return { status: 200, body: { handled: 'need_code' } };
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
    await reply(alreadyDecidedText(target.video));
    return { status: 200, body: { handled: 'already_decided' } };
  }
  await reply(confirmationText(result.video, result.video.status));
  return { status: 200, body: { handled: result.video.status, id: result.video.id } };
}

export async function consumeMagicLink({ store, token, now = Date.now() }) {
  if (!token) return null;
  return store.consumeMagicLink({ tokenHash: sha256Hex(token), now });
}

export async function listPendingForReview(store, now = Date.now()) {
  const rows = await store.listPendingVideos(now);
  return rows.map(pendingVideoPublic);
}
