import { redact } from './redact.js';

const PHI_KEYS = new Set([
  'prompt', 'text', 'input', 'output', 'response', 'message', 'messages', 'content',
  'parts', 'script', 'transcript', 'query', 'answer', 'phi', 'body', 'headline',
]);

export function sanitizeUsageRow(row, { noPhi = false } = {}) {
  const clean = {
    workload: row.workload,
    model: row.model,
    input_tokens: Number.isFinite(row.input_tokens) ? row.input_tokens : null,
    output_tokens: Number.isFinite(row.output_tokens) ? row.output_tokens : null,
    video_seconds: Number.isFinite(row.video_seconds) ? row.video_seconds : null,
    estimated_usd: Number.isFinite(row.estimated_usd) ? row.estimated_usd : null,
    status: String(row.status || 'unknown').slice(0, 40),
    latency_ms: Number.isFinite(row.latency_ms) ? row.latency_ms : null,
    metadata: {},
  };
  if (noPhi || row.workload === 'health') {
    return clean;
  }
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  for (const [k, v] of Object.entries(meta)) {
    if (PHI_KEYS.has(k) || /prompt|response|message|transcript|phi/i.test(k)) continue;
    if (typeof v === 'string') clean.metadata[k] = v.slice(0, 200);
    else if (typeof v === 'number' || typeof v === 'boolean' || v == null) clean.metadata[k] = v;
  }
  return clean;
}

function memoryStore() {
  const usage = [];
  const circuits = new Map();
  return {
    kind: 'memory',
    async insertUsage(row) {
      usage.push({ ...row, created_at_ms: row.created_at_ms || Date.now() });
    },
    async sumUsage(workload, sinceMs) {
      return usage.filter(r => r.workload === workload && r.created_at_ms >= sinceMs && r.status !== 'error_unbilled')
        .reduce((s, r) => s + (Number(r.estimated_usd) || 0), 0);
    },
    async countRecent(workload, sinceMs) {
      return usage.filter(r => r.workload === workload && r.created_at_ms >= sinceMs).length;
    },
    async getCircuit(workload) {
      return circuits.get(workload) || { state: 'closed', failures: 0, opened_at_ms: null };
    },
    async setCircuit(workload, state) {
      circuits.set(workload, { ...state, workload });
    },
    _usage: usage,
    _circuits: circuits,
  };
}

function supabaseHeaders(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

function supabaseStore(env, fetchImpl) {
  const base = String(env.SUPABASE_URL).replace(/\/$/, '');
  async function rest(method, path, { body, query } = {}) {
    const url = `${base}/rest/v1/${path}${query || ''}`;
    const response = await fetchImpl(url, {
      method,
      headers: supabaseHeaders(env),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(redact(`Supabase ${method} ${path} failed (${response.status})`, env));
      error.status = 503;
      error.expose = true;
      error.body = redact(text, env).slice(0, 300);
      throw error;
    }
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  }
  return {
    kind: 'supabase',
    async insertUsage(row) {
      await rest('POST', 'gemini_usage', { body: row });
    },
    async sumUsage(workload, sinceMs) {
      const since = new Date(sinceMs).toISOString();
      const rows = await rest('GET', 'gemini_usage', {
        query: `?workload=eq.${encodeURIComponent(workload)}&created_at=gte.${encodeURIComponent(since)}&select=estimated_usd,status`,
      }) || [];
      return rows.filter(r => r.status !== 'error_unbilled').reduce((s, r) => s + (Number(r.estimated_usd) || 0), 0);
    },
    async countRecent(workload, sinceMs) {
      const since = new Date(sinceMs).toISOString();
      const rows = await rest('GET', 'gemini_usage', {
        query: `?workload=eq.${encodeURIComponent(workload)}&created_at=gte.${encodeURIComponent(since)}&select=id`,
      }) || [];
      return rows.length;
    },
    async getCircuit(workload) {
      const rows = await rest('GET', 'gemini_circuit', {
        query: `?workload=eq.${encodeURIComponent(workload)}&select=*`,
      }) || [];
      const row = rows[0];
      if (!row) return { state: 'closed', failures: 0, opened_at_ms: null };
      return {
        state: row.state,
        failures: Number(row.failures) || 0,
        opened_at_ms: row.opened_at ? Date.parse(row.opened_at) : null,
        updated_at_ms: row.updated_at ? Date.parse(row.updated_at) : null,
      };
    },
    async setCircuit(workload, state) {
      await rest('POST', 'gemini_circuit', {
        query: '?on_conflict=workload',
        body: {
          workload,
          state: state.state,
          failures: state.failures || 0,
          opened_at: state.opened_at_ms ? new Date(state.opened_at_ms).toISOString() : null,
          updated_at: new Date(state.updated_at_ms || Date.now()).toISOString(),
        },
      });
    },
  };
}

export function supabaseConfigured(env) {
  return Boolean(env?.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY));
}

export function createMemoryStore() {
  return memoryStore();
}

export function createSupabaseStore(env, fetchImpl = fetch) {
  if (!supabaseConfigured(env)) throw new Error('Supabase is not configured.');
  const inner = supabaseStore(env, fetchImpl);
  inner.setCircuit = async (workload, state) => {
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
    const url = `${String(env.SUPABASE_URL).replace(/\/$/, '')}/rest/v1/gemini_circuit?on_conflict=workload`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        workload,
        state: state.state,
        failures: state.failures || 0,
        opened_at: state.opened_at_ms ? new Date(state.opened_at_ms).toISOString() : null,
        updated_at: new Date(state.updated_at_ms || Date.now()).toISOString(),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const error = new Error(redact(`Supabase circuit upsert failed (${response.status})`, env));
      error.status = 503;
      error.expose = true;
      throw error;
    }
  };
  return inner;
}

export function createStore(env, fetchImpl = fetch) {
  if (supabaseConfigured(env)) return createSupabaseStore(env, fetchImpl);
  return createMemoryStore();
}
