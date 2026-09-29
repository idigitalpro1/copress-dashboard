export const WORKLOADS = ['video', 'copy', 'health'];

export class KeyIsolationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'KeyIsolationError';
    this.status = 503;
    this.expose = true;
    this.code = 'key_missing';
  }
}

function read(env, name) {
  const value = env?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function keyEnvName(registry, workload) {
  const spec = registry.workloads[workload];
  if (!spec) throw new KeyIsolationError(`Unknown Gemini workload '${workload}'.`);
  return { primary: spec.keyEnv, fallback: spec.fallbackKeyEnv || null };
}

/**
 * Pick the API key for one workload. Never falls back across workloads
 * and never falls back to a plain GEMINI_API_KEY.
 */
export function selectKey(env, registry, workload) {
  const spec = registry.workloads[workload];
  if (!spec) throw new KeyIsolationError(`Unknown Gemini workload '${workload}'.`);
  const primary = read(env, spec.keyEnv);
  if (primary) return { key: primary, source: spec.keyEnv, fallback: false };
  throw new KeyIsolationError(`${spec.keyEnv} is not set. No Gemini call made for workload '${workload}'.`);
}

export function hasWorkloadKey(env, registry, workload) {
  try {
    selectKey(env, registry, workload);
    return true;
  } catch (error) {
    if (error instanceof KeyIsolationError) return false;
    throw error;
  }
}

export function describeKeyPolicy() {
  return {
    video: { primary: 'GEMINI_KEY_VIDEO', fallback: null, ownedBy: 'patrick-server' },
    copy: { primary: 'GEMINI_KEY_COPY', fallback: null },
    health: { primary: 'GEMINI_KEY_HEALTH', fallback: null },
    rule: 'Never fall back across workloads. Health must never use the video key or vice versa. No GEMINI_API_KEY fallback.',
  };
}

export function secretValues(env) {
  const names = [
    'GEMINI_KEY_VIDEO', 'GEMINI_KEY_COPY', 'GEMINI_KEY_HEALTH',
    'GEMINI_API_KEY_VIDEO', 'GEMINI_API_KEY_COPY', 'GEMINI_API_KEY_SUSAN', 'GEMINI_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'CLOUDINARY_API_SECRET',
    'XAI_API_KEY', 'VIDEO_STUDIO_PASSWORD', 'CRON_SECRET',
    'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_TOKEN_ENC_KEY',
  ];
  return names.map(name => read(env, name)).filter(Boolean);
}
