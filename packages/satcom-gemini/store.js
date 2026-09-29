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
  if (noPhi || row.workload === 'ask_susan') {
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
  const jobs = new Map();
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
    async insertJob(job) {
      jobs.set(job.id, { ...job });
      return job;
    },
    async updateJob(id, patch) {
      const current = jobs.get(id);
      if (!current) return null;
      const next = { ...current, ...patch, updated_at_ms: patch.updated_at_ms || Date.now() };
      jobs.set(id, next);
      return next;
    },
    async getJob(id) {
      return jobs.get(id) || null;
    },
    async listJobs({ status, statuses, limit = 20 } = {}) {
      let rows = [...jobs.values()].sort((a, b) => (a.created_at_ms || 0) - (b.created_at_ms || 0));
      const want = statuses || (status ? [status] : null);
      if (want) rows = rows.filter(j => want.includes(j.status));
      return rows.slice(0, limit);
    },
    async countActiveJobs() {
      return [...jobs.values()].filter(j => ['queued', 'submitting', 'running', 'downloading', 'uploading'].includes(j.status)).length;
    },
    _usage: usage,
    _jobs: jobs,
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
      // Prefer-resolution merge: send Prefer header via upsert
    },
    async insertJob(job) {
      const rows = await rest('POST', 'video_jobs', { body: toJobRow(job) });
      return fromJobRow(rows?.[0]) || job;
    },
    async updateJob(id, patch) {
      const rows = await rest('PATCH', 'video_jobs', {
        query: `?id=eq.${encodeURIComponent(id)}`,
        body: toJobRow(patch, true),
      });
      return fromJobRow(rows?.[0]);
    },
    async getJob(id) {
      const rows = await rest('GET', 'video_jobs', { query: `?id=eq.${encodeURIComponent(id)}&select=*` }) || [];
      return fromJobRow(rows[0]);
    },
    async listJobs({ status, statuses, limit = 20 } = {}) {
      const want = statuses || (status ? [status] : null);
      const filter = want?.length === 1
        ? `&status=eq.${encodeURIComponent(want[0])}`
        : want?.length ? `&status=in.(${want.join(',')})` : '';
      const rows = await rest('GET', 'video_jobs', {
        query: `?select=*&order=created_at.asc&limit=${Math.min(Number(limit) || 20, 50)}${filter}`,
      }) || [];
      return rows.map(fromJobRow);
    },
    async countActiveJobs() {
      const rows = await rest('GET', 'video_jobs', {
        query: '?select=id&status=in.(queued,submitting,running,downloading,uploading)',
      }) || [];
      return rows.length;
    },
  };
}

function toJobRow(job, patch = false) {
  const row = {};
  const map = {
    id: 'id', status: 'status', interaction_id: 'interaction_id', model: 'model',
    prompt: 'prompt', brand: 'brand', headline: 'headline', script: 'script',
    aspect_ratio: 'aspect_ratio', resolution: 'resolution', target_seconds: 'target_seconds',
    error_redacted: 'error_redacted', cloudinary_public_id: 'cloudinary_public_id',
    cloudinary_folder: 'cloudinary_folder', sidecar: 'sidecar', estimated_usd: 'estimated_usd',
    gemini_status: 'gemini_status',
  };
  for (const [k, col] of Object.entries(map)) if (job[k] !== undefined) row[col] = job[k];
  if (!patch && job.created_at_ms) row.created_at = new Date(job.created_at_ms).toISOString();
  if (job.updated_at_ms) row.updated_at = new Date(job.updated_at_ms).toISOString();
  return row;
}

function fromJobRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    interaction_id: row.interaction_id,
    model: row.model,
    prompt: row.prompt,
    brand: row.brand,
    headline: row.headline,
    script: row.script,
    aspect_ratio: row.aspect_ratio,
    resolution: row.resolution,
    target_seconds: row.target_seconds,
    error_redacted: row.error_redacted,
    cloudinary_public_id: row.cloudinary_public_id,
    cloudinary_folder: row.cloudinary_folder,
    sidecar: row.sidecar,
    estimated_usd: row.estimated_usd == null ? null : Number(row.estimated_usd),
    gemini_status: row.gemini_status,
    created_at_ms: row.created_at ? Date.parse(row.created_at) : null,
    updated_at_ms: row.updated_at ? Date.parse(row.updated_at) : null,
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
  // PostgREST upsert for circuit needs Prefer: resolution=merge-duplicates
  const originalSet = inner.setCircuit.bind(inner);
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
    if (!response.ok) return originalSet(workload, state);
  };
  return inner;
}

export function createStore(env, fetchImpl = fetch) {
  if (supabaseConfigured(env)) return createSupabaseStore(env, fetchImpl);
  return createMemoryStore();
}
