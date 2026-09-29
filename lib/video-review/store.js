import { applyDecision } from './transitions.js';

function nowIso(now) {
  return new Date(now).toISOString();
}

export function reviewStoreConfigured(env = process.env) {
  const url = env.SATCOM_VIDEO_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SATCOM_VIDEO_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(url && key);
}

export function createMemoryStore({ now = () => Date.now() } = {}) {
  const reviewers = new Map();
  const creators = new Map();
  const optOuts = new Map();
  const videos = new Map();
  const magicLinks = [];
  const sms = [];
  const audit = [];
  const seenSms = new Set();

  return {
    kind: 'memory',
    async getReviewerByPhone(phone) {
      return [...reviewers.values()].find(row => row.phone_e164 === phone) || null;
    },
    async getReviewerById(id) {
      return reviewers.get(id) || null;
    },
    async addReviewer(row) {
      reviewers.set(row.id, { opted_in: false, ...row });
      return reviewers.get(row.id);
    },
    async setReviewerOptIn(id, optedIn, at = now()) {
      const row = reviewers.get(id);
      if (!row) return null;
      row.opted_in = optedIn;
      row.opted_out_at = optedIn ? null : nowIso(at);
      row.updated_at = nowIso(at);
      return row;
    },
    async listOptedInReviewers() {
      return [...reviewers.values()].filter(row => row.opted_in && optOuts.get(row.phone_e164)?.opted_out !== true);
    },
    async addCreator(row) {
      creators.set(row.phone_e164, { opted_in: true, ...row });
      return creators.get(row.phone_e164);
    },
    async getCreatorByPhone(phone) {
      return creators.get(phone) || null;
    },
    async getSmsOptOut(phone) {
      return optOuts.get(phone) || null;
    },
    async setSmsOptOut(phone, optedOut, at = now()) {
      const row = { phone_e164: phone, opted_out: Boolean(optedOut), updated_at: nowIso(at) };
      optOuts.set(phone, row);
      return row;
    },
    async insertVideo(row) {
      if ([...videos.values()].some(item => item.short_code === row.short_code && ['submitted', 'pending_review'].includes(item.status))) {
        throw new Error('short_code_conflict');
      }
      videos.set(row.id, { ...row });
      return videos.get(row.id);
    },
    async getVideoById(id) {
      return videos.get(id) || null;
    },
    async getVideoByShortCode(code) {
      const match = [...videos.values()].filter(row => row.short_code === code);
      return match.sort((a, b) => Date.parse(b.submitted_at || 0) - Date.parse(a.submitted_at || 0))[0] || null;
    },
    async listPendingVideos(at = now()) {
      return [...videos.values()].filter(row => row.status === 'pending_review' && (!row.code_expires_at || Date.parse(row.code_expires_at) > at))
        .sort((a, b) => Date.parse(a.submitted_at || 0) - Date.parse(b.submitted_at || 0));
    },
    async listPublishedCatalogItems() {
      return [...videos.values()].filter(row => row.status === 'published');
    },
    async decideVideo({ id, status, deciderId, reason, source, now: at = now() }) {
      const current = videos.get(id);
      const result = applyDecision(current, { status, deciderId, reason, source, now: at });
      if (!result.ok) return null;
      videos.set(id, result.video);
      return result.video;
    },
    async insertMagicLink(row) {
      magicLinks.push({ used_at: null, ...row });
      return row;
    },
    async consumeMagicLink({ tokenHash, now: at = now() }) {
      const link = magicLinks.find(row => row.token_hash === tokenHash && !row.used_at && Date.parse(row.expires_at) > at);
      if (!link) return null;
      link.used_at = nowIso(at);
      return reviewers.get(link.reviewer_id) || null;
    },
    async recordSms(row) {
      const key = `${row.provider}:${row.provider_message_id}`;
      if (seenSms.has(key)) return { inserted: false };
      seenSms.add(key);
      sms.push(row);
      return { inserted: true };
    },
    async audit(row) {
      audit.push({ ...row, created_at: nowIso(now()) });
    },
    snapshot() {
      return { reviewers, creators, optOuts, videos, magicLinks, sms, audit };
    },
  };
}

async function rest(env, fetchImpl, { path, method = 'GET', query = '', body, prefer = 'return=representation' }) {
  const base = (env.SATCOM_VIDEO_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SATCOM_VIDEO_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const url = `${base}/rest/v1/${path}${query ? `?${query}` : ''}`;
  const response = await fetchImpl(url, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Accept-Profile': 'satcom_video',
      'Content-Profile': 'satcom_video',
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error('store_unavailable');
  return text ? JSON.parse(text) : [];
}

export function createSupabaseStore({ env = process.env, fetchImpl = fetch } = {}) {
  return {
    kind: 'supabase',
    async getReviewerByPhone(phone) {
      const rows = await rest(env, fetchImpl, { path: 'reviewers', query: `phone_e164=eq.${encodeURIComponent(phone)}&select=*` });
      return rows[0] || null;
    },
    async getReviewerById(id) {
      const rows = await rest(env, fetchImpl, { path: 'reviewers', query: `id=eq.${encodeURIComponent(id)}&select=*` });
      return rows[0] || null;
    },
    async setReviewerOptIn(id, optedIn, at = Date.now()) {
      const rows = await rest(env, fetchImpl, {
        path: 'reviewers',
        method: 'PATCH',
        query: `id=eq.${encodeURIComponent(id)}`,
        body: { opted_in: optedIn, opted_out_at: optedIn ? null : nowIso(at), updated_at: nowIso(at) },
      });
      return rows[0] || null;
    },
    async listOptedInReviewers() {
      return rest(env, fetchImpl, { path: 'reviewers', query: 'opted_in=eq.true&select=*' });
    },
    async getCreatorByPhone(phone) {
      const rows = await rest(env, fetchImpl, { path: 'creators', query: `phone_e164=eq.${encodeURIComponent(phone)}&select=*` });
      const row = rows[0];
      if (!row) return null;
      return {
        phone_e164: row.phone_e164,
        slug: row.slug,
        name: row.display_name || row.name,
        display_name: row.display_name,
        opted_in: row.opted_in !== false,
      };
    },
    async getSmsOptOut(phone) {
      const rows = await rest(env, fetchImpl, { path: 'sms_opt_outs', query: `phone_e164=eq.${encodeURIComponent(phone)}&select=*` });
      return rows[0] || null;
    },
    async setSmsOptOut(phone, optedOut, at = Date.now()) {
      const rows = await rest(env, fetchImpl, {
        path: 'sms_opt_outs',
        method: 'POST',
        prefer: 'return=representation,resolution=merge-duplicates',
        body: { phone_e164: phone, opted_out: Boolean(optedOut), updated_at: nowIso(at) },
      });
      return rows[0] || { phone_e164: phone, opted_out: Boolean(optedOut) };
    },
    async insertVideo(row) {
      const rows = await rest(env, fetchImpl, { path: 'videos', method: 'POST', body: row });
      return rows[0];
    },
    async getVideoById(id) {
      const rows = await rest(env, fetchImpl, { path: 'videos', query: `id=eq.${encodeURIComponent(id)}&select=*` });
      return rows[0] || null;
    },
    async getVideoByShortCode(code) {
      const rows = await rest(env, fetchImpl, {
        path: 'videos',
        query: `short_code=eq.${encodeURIComponent(code)}&select=*&order=submitted_at.desc&limit=1`,
      });
      return rows[0] || null;
    },
    async listPendingVideos(at = Date.now()) {
      const iso = nowIso(at);
      return rest(env, fetchImpl, {
        path: 'videos',
        query: `status=eq.pending_review&or=(code_expires_at.is.null,code_expires_at.gt.${iso})&select=*&order=submitted_at.asc`,
      });
    },
    async listPublishedCatalogItems() {
      return rest(env, fetchImpl, { path: 'videos', query: 'status=eq.published&select=id,title,description,creator,credit,publications,towns,published_at,kind,live_confirmed_at,poster_url,playback,captions,status' });
    },
    async decideVideo({ id, status, deciderId, reason, source, now: at = Date.now() }) {
      const iso = nowIso(at);
      const body = {
        status,
        decided_at: iso,
        decider_id: deciderId,
        decision_reason: reason || null,
        decision_source: source,
        updated_at: iso,
      };
      if (status === 'published') body.published_at = iso;
      const rows = await rest(env, fetchImpl, {
        path: 'videos',
        method: 'PATCH',
        query: `id=eq.${encodeURIComponent(id)}&status=eq.pending_review&or=(code_expires_at.is.null,code_expires_at.gt.${iso})`,
        body,
      });
      return rows[0] || null;
    },
    async insertMagicLink(row) {
      const rows = await rest(env, fetchImpl, { path: 'magic_links', method: 'POST', body: row });
      return rows[0];
    },
    async consumeMagicLink({ tokenHash, now: at = Date.now() }) {
      const iso = nowIso(at);
      const rows = await rest(env, fetchImpl, {
        path: 'magic_links',
        method: 'PATCH',
        query: `token_hash=eq.${encodeURIComponent(tokenHash)}&used_at=is.null&expires_at=gt.${iso}`,
        body: { used_at: iso },
      });
      const link = rows[0];
      if (!link) return null;
      return this.getReviewerById(link.reviewer_id);
    },
    async recordSms(row) {
      const base = (env.SATCOM_VIDEO_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
      const key = env.SATCOM_VIDEO_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
      const response = await fetchImpl(`${base}/rest/v1/sms_messages`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Profile': 'satcom_video',
          'Content-Profile': 'satcom_video',
          Prefer: 'return=representation,resolution=ignore-duplicates',
        },
        body: JSON.stringify(row),
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 409) return { inserted: false };
      if (!response.ok) throw new Error('store_unavailable');
      const rows = await response.json().catch(() => []);
      return { inserted: Array.isArray(rows) ? rows.length > 0 : Boolean(rows) };
    },
    async audit(row) {
      await rest(env, fetchImpl, { path: 'audit_log', method: 'POST', body: row, prefer: 'return=minimal' });
    },
  };
}

export function createReviewStore({ env = process.env, fetchImpl = fetch } = {}) {
  if (!reviewStoreConfigured(env)) return null;
  return createSupabaseStore({ env, fetchImpl });
}
