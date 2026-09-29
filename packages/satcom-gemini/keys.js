export const WORKLOADS = ['video', 'copy', 'ask_susan'];

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
 * Pick the API key for one workload. Never falls back across workloads.
 * A plain GEMINI_API_KEY is allowed only when the workload lists it as fallback
 * (video and copy). ask_susan has no fallback.
 */
export function selectKey(env, registry, workload) {
  const spec = registry.workloads[workload];
  if (!spec) throw new KeyIsolationError(`Unknown Gemini workload '${workload}'.`);
  const primary = read(env, spec.keyEnv);
  if (primary) return { key: primary, source: spec.keyEnv, fallback: false };
  if (spec.fallbackKeyEnv) {
    const fallback = read(env, spec.fallbackKeyEnv);
    if (fallback) return { key: fallback, source: spec.fallbackKeyEnv, fallback: true };
  }
  const hint = spec.fallbackKeyEnv
    ? `${spec.keyEnv} (or ${spec.fallbackKeyEnv} fallback)`
    : spec.keyEnv;
  throw new KeyIsolationError(`${hint} is not set. No Gemini call made for workload '${workload}'.`);
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
    video: { primary: 'GEMINI_API_KEY_VIDEO', fallback: 'GEMINI_API_KEY' },
    copy: { primary: 'GEMINI_API_KEY_COPY', fallback: 'GEMINI_API_KEY' },
    ask_susan: { primary: 'GEMINI_API_KEY_SUSAN', fallback: null },
    rule: 'Never fall back across workloads. Ask Susan must never use the video key or vice versa.',
  };
}

export function secretValues(env) {
  const names = [
    'GEMINI_API_KEY_VIDEO', 'GEMINI_API_KEY_COPY', 'GEMINI_API_KEY_SUSAN', 'GEMINI_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'CLOUDINARY_API_SECRET',
    'XAI_API_KEY', 'VIDEO_STUDIO_PASSWORD', 'CRON_SECRET',
  ];
  return names.map(name => read(env, name)).filter(Boolean);
}
