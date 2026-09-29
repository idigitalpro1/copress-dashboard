import { supabaseConfigured } from '../../../packages/satcom-gemini/index.js';
import { redact } from '../../../packages/satcom-gemini/redact.js';
import { auditRow } from './audit.js';
import { decodeYoutubeTokenCookie, youtubeTokenCookie, YOUTUBE_TOKEN_COOKIE } from './youtube.js';

function supabaseHeaders(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

function memoryStore() {
  const jobs = new Map();
  const reviews = new Map();
  const published = new Map();
  const audit = [];
  let youtube = null;
  const quota = new Map();
  return {
    kind: 'memory',
    async getJob(key) { return jobs.get(key) || null; },
    async upsertJob(job) {
      const prev = jobs.get(job.idempotency_key);
      const next = { ...prev, ...job, updated_at_ms: job.updated_at_ms || Date.now() };
      jobs.set(job.idempotency_key, next);
      return next;
    },
    async listJobs(assetPublicId) {
      return [...jobs.values()].filter(j => j.asset_public_id === assetPublicId)
        .sort((a, b) => (a.target || '').localeCompare(b.target || ''));
    },
    async listQueuedYoutube(now) {
      return [...jobs.values()].filter(j => j.target === 'youtube' && j.status === 'queued' && (!j.run_after_ms || j.run_after_ms <= now));
    },
    async getYoutubeToken() { return youtube; },
    async setYoutubeToken(row) { youtube = { ...row, updated_at_ms: Date.now() }; return youtube; },
    async clearYoutubeToken() { youtube = null; },
    async getQuota(day) { return quota.get(day) || { day, upload_count: 0 }; },
    async incrementQuota(day, cap) {
      const cur = quota.get(day) || { day, upload_count: 0 };
      if (cur.upload_count >= cap) return { ...cur, cap, accepted: false };
      const next = { day, upload_count: cur.upload_count + 1, cap };
      quota.set(day, next);
      return { ...next, accepted: true };
    },
    async getReview(assetPublicId, version) { return reviews.get(`${assetPublicId}|${version}`) || null; },
    async saveReview(row) {
      reviews.set(`${row.asset_public_id}|${row.version}`, row);
      return row;
    },
    async listPublished() { return [...published.values()]; },
    async upsertPublished(item) { published.set(item.id, item); return item; },
    async removePublished(id) { published.delete(id); },
    async insertAudit(row) { audit.push({ ...auditRow(row), created_at_ms: Date.now() }); },
    _jobs: jobs,
    _audit: audit,
    _published: published,
  };
}

function supabaseStore(env, fetchImpl) {
  const base = String(env.SUPABASE_URL).replace(/\/$/, '');
  async function rest(method, path, { body, query, prefer } = {}) {
    const response = await fetchImpl(`${base}/rest/v1/${path}${query || ''}`, {
      method,
      headers: { ...supabaseHeaders(env), ...(prefer ? { Prefer: prefer } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(redact(`Supabase ${method} ${path} failed (${response.status})`, env));
      error.status = 503;
      error.upstreamStatus = response.status;
      error.expose = true;
      throw error;
    }
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  }
  const jobFromRow = row => row && ({
    ...row,
    updated_at_ms: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
    run_after_ms: row.run_after ? Date.parse(row.run_after) : null,
  });
  return {
    kind: 'supabase',
    async getJob(key) {
      const rows = await rest('GET', 'video_publish_jobs', { query: `?idempotency_key=eq.${encodeURIComponent(key)}&select=*` }) || [];
      return jobFromRow(rows[0]);
    },
    async upsertJob(job) {
      const body = {
        idempotency_key: job.idempotency_key,
        asset_public_id: job.asset_public_id,
        version: job.version,
        target: job.target,
        status: job.status,
        youtube_video_id: job.youtube_video_id || null,
        satcom_entry_id: job.satcom_entry_id || null,
        public_playback_url: job.public_playback_url || null,
        error: job.error ? String(job.error).slice(0, 300) : null,
        run_after: job.run_after_ms ? new Date(job.run_after_ms).toISOString() : null,
        result: job.result && typeof job.result === 'object' ? job.result : {},
        updated_at: new Date(job.updated_at_ms || Date.now()).toISOString(),
      };
      const rows = await rest('POST', 'video_publish_jobs', {
        query: '?on_conflict=idempotency_key',
        prefer: 'resolution=merge-duplicates,return=representation',
        body,
      });
      return jobFromRow(Array.isArray(rows) ? rows[0] : rows) || { ...job, ...body };
    },
    async listJobs(assetPublicId) {
      const rows = await rest('GET', 'video_publish_jobs', {
        query: `?asset_public_id=eq.${encodeURIComponent(assetPublicId)}&select=*&order=target.asc`,
      }) || [];
      return rows.map(jobFromRow);
    },
    async listQueuedYoutube(now) {
      const iso = new Date(now).toISOString();
      const rows = await rest('GET', 'video_publish_jobs', {
        query: `?target=eq.youtube&status=eq.queued&or=(run_after.is.null,run_after.lte.${encodeURIComponent(iso)})&select=*`,
      }) || [];
      return rows.map(jobFromRow);
    },
    async getYoutubeToken() {
      const rows = await rest('GET', 'youtube_oauth_tokens', { query: '?id=eq.studio&select=*' }) || [];
      const row = rows[0];
      if (!row) return null;
      return {
        encrypted_payload: row.encrypted_payload,
        channel_id: row.channel_id,
        channel_title: row.channel_title,
        updated_at_ms: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
      };
    },
    async setYoutubeToken(row) {
      const body = {
        id: 'studio',
        encrypted_payload: row.encrypted_payload,
        channel_id: row.channel_id || null,
        channel_title: row.channel_title ? String(row.channel_title).slice(0, 120) : null,
        updated_at: new Date().toISOString(),
      };
      await rest('POST', 'youtube_oauth_tokens', {
        query: '?on_conflict=id',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body,
      });
      return body;
    },
    async clearYoutubeToken() {
      await rest('DELETE', 'youtube_oauth_tokens', { query: '?id=eq.studio' });
    },
    async getQuota(day) {
      const rows = await rest('GET', 'youtube_upload_quota', { query: `?day=eq.${encodeURIComponent(day)}&select=*` }) || [];
      return rows[0] || { day, upload_count: 0 };
    },
    async incrementQuota(day, cap) {
      const cur = await this.getQuota(day);
      const count = Number(cur.upload_count) || 0;
      if (count >= cap) return { day, upload_count: count, cap, accepted: false };
      await rest('POST', 'youtube_upload_quota', {
        query: '?on_conflict=day',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: { day, upload_count: count + 1, cap, updated_at: new Date().toISOString() },
      });
      return { day, upload_count: count + 1, cap, accepted: true };
    },
    async getReview(assetPublicId, version) {
      const rows = await rest('GET', 'video_publish_reviews', {
        query: `?asset_public_id=eq.${encodeURIComponent(assetPublicId)}&version=eq.${encodeURIComponent(version)}&select=*`,
      }) || [];
      return rows[0] || null;
    },
    async saveReview(row) {
      await rest('POST', 'video_publish_reviews', {
        query: '?on_conflict=asset_public_id,version',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: {
          asset_public_id: row.asset_public_id,
          version: row.version,
          reviewed_title: Boolean(row.review?.title),
          reviewed_description: Boolean(row.review?.description),
          reviewed_captions: Boolean(row.review?.captions),
          reviewed_tags: Boolean(row.review?.tags),
          consent_people: Boolean(row.consent?.people),
          consent_music: Boolean(row.consent?.music),
          consent_paul_hill: Boolean(row.consent?.paul_hill),
          contains_synthetic_media: Boolean(row.contains_synthetic_media),
          youtube_privacy: row.youtube_privacy || 'unlisted',
          shoot_date: row.shoot_date,
          updated_at: new Date().toISOString(),
        },
      });
      return row;
    },
    async listPublished() {
      const rows = await rest('GET', 'video_feed_published', { query: '?select=entry,status&status=eq.published' }) || [];
      return rows.map(r => r.entry).filter(Boolean);
    },
    async upsertPublished(item) {
      await rest('POST', 'video_feed_published', {
        query: '?on_conflict=id',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: { id: item.id, status: 'published', entry: item, updated_at: new Date().toISOString() },
      });
      return item;
    },
    async removePublished(id) {
      await rest('POST', 'video_feed_published', {
        query: '?on_conflict=id',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: { id, status: 'unpublished', updated_at: new Date().toISOString() },
      });
    },
    async insertAudit(row) {
      const clean = auditRow(row);
      await rest('POST', 'video_publish_audit', {
        prefer: 'return=minimal',
        body: { ...clean, created_at: new Date().toISOString() },
      });
    },
  };
}

export function createPublishMemoryStore() {
  return memoryStore();
}

export function isMissingPublishRelation(error) {
  const upstream = Number(error?.upstreamStatus);
  const msg = String(error?.message || '');
  return upstream === 404
    || /PGRST205|42P01|schema cache|Could not find the table|does not exist/i.test(msg);
}

export function classifyPublishStoreError(error) {
  return isMissingPublishRelation(error) ? 'migrations_not_applied' : 'store_unavailable';
}

function degradeToMemory(primary, fallback) {
  let reason = null;
  const invoke = async (name, args) => {
    const target = reason ? fallback : primary;
    try {
      return await target[name](...args);
    } catch (error) {
      if (!reason && (isMissingPublishRelation(error) || error?.status === 503)) {
        reason = classifyPublishStoreError(error);
        return fallback[name](...args);
      }
      throw error;
    }
  };
  const api = {
    get kind() { return reason ? fallback.kind : primary.kind; },
    get degraded() { return reason; },
  };
  for (const name of Object.keys(primary)) {
    if (typeof primary[name] === 'function') api[name] = (...args) => invoke(name, args);
  }
  return api;
}

export function attachCookieTokens(store, env, cookies = {}, outgoing = []) {
  if (!store) return store;
  return {
    ...store,
    get kind() { return store.kind === 'memory' ? 'memory+cookie' : store.kind; },
    get degraded() { return store.degraded || null; },
    async getYoutubeToken() {
      const row = await store.getYoutubeToken();
      if (row?.encrypted_payload) return row;
      return decodeYoutubeTokenCookie(env, cookies[YOUTUBE_TOKEN_COOKIE]);
    },
    async setYoutubeToken(row) {
      const saved = await store.setYoutubeToken(row);
      outgoing.push(youtubeTokenCookie(env, row));
      return saved;
    },
    async clearYoutubeToken() {
      await store.clearYoutubeToken();
      outgoing.push(youtubeTokenCookie(env, { encrypted_payload: '' }, 0));
    },
  };
}

export function createPublishStore(env, fetchImpl = fetch) {
  if (supabaseConfigured(env)) return degradeToMemory(supabaseStore(env, fetchImpl), memoryStore());
  return memoryStore();
}
