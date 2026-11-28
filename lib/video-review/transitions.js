export const VIDEO_STATUSES = ['submitted', 'pending_review', 'published', 'rejected'];

export function nextStatusForDecision(decision) {
  if (decision === 'approve') return 'published';
  if (decision === 'reject') return 'rejected';
  return null;
}

export function canDecide(video, now = Date.now()) {
  if (!video || video.status !== 'pending_review') return { ok: false, reason: 'not_pending' };
  if (video.code_expires_at && Date.parse(video.code_expires_at) <= now) return { ok: false, reason: 'code_expired' };
  return { ok: true };
}

export function applyDecision(video, { status, deciderId, reason, source, now = Date.now() }) {
  const gate = canDecide(video, now);
  if (!gate.ok) return gate;
  if (status !== 'published' && status !== 'rejected') return { ok: false, reason: 'invalid_status' };
  return {
    ok: true,
    video: {
      ...video,
      status,
      decided_at: new Date(now).toISOString(),
      decider_id: deciderId,
      decision_reason: reason || null,
      decision_source: source,
      published_at: status === 'published' ? video.published_at || new Date(now).toISOString() : video.published_at,
      updated_at: new Date(now).toISOString(),
    },
  };
}
