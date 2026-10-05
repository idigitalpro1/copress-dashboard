import { hasWorkloadKey, loadRegistry } from '../../packages/satcom-gemini/index.js';

// Hook for turning a URL-desk script into a video. Intentionally a stub: this repo does not
// submit or poll generation (that stays on Patrick's Omni queue, GEMINI_KEY_VIDEO, the only
// video vendor). The returned status is stored on the draft so the queue can pick it up.
export const VIDEO_HOOK_VERSION = 1;

export function videoHookStatus(env, requested) {
  const keyed = hasWorkloadKey(env, loadRegistry(), 'video');
  if (!requested) return { version: VIDEO_HOOK_VERSION, status: 'not_requested', requested: false, key_present: keyed };
  return {
    version: VIDEO_HOOK_VERSION,
    status: keyed ? 'stub_ready' : 'blocked_no_key',
    requested: true,
    key_present: keyed,
    note: keyed
      ? 'Video generation is not wired in this repo. The script is saved as a draft for Patrick\'s Omni queue (GEMINI_KEY_VIDEO). Output returns as a private draft in satcom/generated/ and goes through the review gate.'
      : 'GEMINI_KEY_VIDEO is not set on this deployment, so no video can be generated. The script is still saved as a draft.',
  };
}

// Extension point: replace the body with a call that enqueues work for the Omni queue.
// It must never publish, must never use a key other than GEMINI_KEY_VIDEO, and must write
// its result as a private draft only.
export async function requestVideoGeneration({ env, draft }) {
  return { ...videoHookStatus(env, true), draft_id: draft?.id || null, enqueued: false };
}
