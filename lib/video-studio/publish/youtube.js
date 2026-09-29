import { createHash, createHmac, randomBytes } from 'node:crypto';
import { decryptJson, encryptJson } from './crypto.js';
import { parseTokenEncKey, youtubeRedirectUri, YOUTUBE_SCOPES } from './config.js';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
const VIDEOS = 'https://www.googleapis.com/youtube/v3/videos';
const CHANNELS = 'https://www.googleapis.com/youtube/v3/channels';

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

function stateKey(env) {
  return parseTokenEncKey(env.YOUTUBE_TOKEN_ENC_KEY);
}

function sessionFingerprint(sessionToken) {
  if (typeof sessionToken !== 'string' || !sessionToken) return '';
  return createHash('sha256').update(sessionToken).digest('hex').slice(0, 32);
}

function hmacEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  let ok = 0;
  for (let i = 0; i < left.length; i++) ok |= left[i] ^ right[i];
  return ok === 0;
}

export function signOauthState(env, now = Date.now(), sessionToken) {
  const nonce = randomBytes(16).toString('hex');
  const body = Buffer.from(JSON.stringify({
    n: nonce,
    exp: now + 15 * 60_000,
    sub: 'studio',
    sid: sessionFingerprint(sessionToken),
  })).toString('base64url');
  const sig = createHmac('sha256', stateKey(env)).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyOauthState(env, state, now = Date.now(), sessionToken) {
  if (typeof state !== 'string' || state.length > 512) return false;
  const [body, sig, extra] = state.split('.');
  if (!body || !sig || extra !== undefined) return false;
  const expected = createHmac('sha256', stateKey(env)).update(body).digest('base64url');
  if (!hmacEqual(sig, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload?.sub !== 'studio' || !Number.isFinite(payload.exp) || payload.exp <= now) return false;
    // Cookie may be missing on Google's cross-site redirect. A valid signed
    // state (issued only to an authenticated operator) is sufficient CSRF.
    // When the session cookie is present, it must match the bound fingerprint.
    if (sessionToken && payload.sid) {
      return hmacEqual(payload.sid, sessionFingerprint(sessionToken));
    }
    return true;
  } catch { return false; }
}

export function oauthAuthorizeUrl(env, state) {
  const params = new URLSearchParams({
    client_id: env.YOUTUBE_CLIENT_ID,
    redirect_uri: youtubeRedirectUri(env),
    response_type: 'code',
    scope: YOUTUBE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH}?${params}`;
}

async function tokenRequest(env, body, fetchImpl) {
  const response = await fetchImpl(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      ...body,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) {
    throw fail(502, 'YouTube authorization failed. Complete the channel connect again (docs/youtube.md).');
  }
  return json;
}

export async function exchangeCode(env, code, fetchImpl) {
  return tokenRequest(env, { code, grant_type: 'authorization_code', redirect_uri: youtubeRedirectUri(env) }, fetchImpl);
}

export async function refreshAccessToken(env, refreshToken, fetchImpl) {
  return tokenRequest(env, { refresh_token: refreshToken, grant_type: 'refresh_token' }, fetchImpl);
}

export async function channelSummary(accessToken, fetchImpl) {
  const response = await fetchImpl(`${CHANNELS}?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  });
  const json = await response.json().catch(() => ({}));
  const item = json.items?.[0];
  return {
    channel_id: item?.id || null,
    channel_title: item?.snippet?.title ? String(item.snippet.title).slice(0, 120) : null,
  };
}

export async function loadTokens(env, store) {
  const row = await store.getYoutubeToken();
  if (!row?.encrypted_payload) return null;
  const tokens = decryptJson(row.encrypted_payload, env.YOUTUBE_TOKEN_ENC_KEY);
  if (!tokens) return null;
  return { ...row, tokens };
}

export const YOUTUBE_TOKEN_COOKIE = 'satcom_yt';

export function encodeYoutubeTokenCookie(env, row) {
  const key = stateKey(env);
  if (!key || !row?.encrypted_payload) return null;
  const body = Buffer.from(JSON.stringify({
    p: row.encrypted_payload,
    cid: row.channel_id || null,
    title: row.channel_title || null,
  })).toString('base64url');
  const sig = createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function decodeYoutubeTokenCookie(env, token) {
  const key = stateKey(env);
  if (!key || typeof token !== 'string' || token.length > 8000) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = createHmac('sha256', key).update(body).digest('base64url');
  if (!hmacEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.p) return null;
    return {
      encrypted_payload: payload.p,
      channel_id: payload.cid || null,
      channel_title: payload.title || null,
    };
  } catch { return null; }
}

export function youtubeTokenCookie(env, row, maxAge = 180 * 24 * 3600) {
  const value = row?.encrypted_payload ? encodeYoutubeTokenCookie(env, row) : '';
  const parts = [`${YOUTUBE_TOKEN_COOKIE}=${value || ''}`, 'Path=/api/studio', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (env.VERCEL || env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export async function saveTokens(env, store, tokens, channel = {}) {
  const encrypted_payload = encryptJson({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_ms: tokens.expiry_ms || (Date.now() + (Number(tokens.expires_in) || 3600) * 1000),
    scope: tokens.scope,
    token_type: tokens.token_type || 'Bearer',
  }, env.YOUTUBE_TOKEN_ENC_KEY);
  return store.setYoutubeToken({
    encrypted_payload,
    channel_id: channel.channel_id || null,
    channel_title: channel.channel_title || null,
  });
}

export async function accessToken(env, store, fetchImpl, now = Date.now()) {
  const loaded = await loadTokens(env, store);
  if (!loaded?.tokens?.refresh_token) throw fail(503, 'YouTube channel is not connected.');
  const { tokens } = loaded;
  if (tokens.access_token && tokens.expiry_ms && tokens.expiry_ms > now + 60_000) {
    return { token: tokens.access_token, loaded };
  }
  const refreshed = await refreshAccessToken(env, tokens.refresh_token, fetchImpl);
  const merged = {
    refresh_token: refreshed.refresh_token || tokens.refresh_token,
    access_token: refreshed.access_token,
    expires_in: refreshed.expires_in,
    expiry_ms: now + (Number(refreshed.expires_in) || 3600) * 1000,
    scope: refreshed.scope || tokens.scope,
  };
  await saveTokens(env, store, merged, { channel_id: loaded.channel_id, channel_title: loaded.channel_title });
  return { token: merged.access_token, loaded };
}

export function videoResource({ title, description, tags, privacyStatus, containsSyntheticMedia }) {
  return {
    snippet: {
      title: title.slice(0, 100),
      description: description.slice(0, 5000),
      tags: (tags || []).slice(0, 15),
      categoryId: '25',
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
      embeddable: true,
      containsSyntheticMedia: Boolean(containsSyntheticMedia),
    },
  };
}

export async function resumableUpload(env, { accessToken: token, bytes, mime = 'video/mp4', resource }, fetchImpl) {
  const init = await fetchImpl(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mime,
      'X-Upload-Content-Length': String(bytes.length),
    },
    body: JSON.stringify(resource),
    signal: AbortSignal.timeout(20000),
  });
  if (!init.ok) {
    const err = fail(init.status === 403 ? 429 : 502, init.status === 403
      ? 'YouTube API quota or permission was denied. The video was not uploaded.'
      : 'YouTube upload could not start.');
    throw err;
  }
  const location = init.headers.get('location') || init.headers.get('Location');
  if (!location || !/^https:\/\/(www\.)?googleapis\.com\//i.test(location)) {
    throw fail(502, 'YouTube upload session was missing.');
  }
  const put = await fetchImpl(location, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
    },
    body: bytes,
    signal: AbortSignal.timeout(50000),
  });
  const json = await put.json().catch(() => ({}));
  if (!put.ok || !json.id) throw fail(502, 'YouTube upload did not finish.');
  return { video_id: json.id, privacyStatus: json.status?.privacyStatus, containsSyntheticMedia: json.status?.containsSyntheticMedia };
}

export async function updateVideoPrivacy(token, videoId, privacyStatus, fetchImpl) {
  const response = await fetchImpl(`${VIDEOS}?part=status`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: videoId, status: { privacyStatus } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw fail(502, 'YouTube status update failed.');
  return { video_id: videoId, privacyStatus };
}

export async function deleteVideo(token, videoId, fetchImpl) {
  const response = await fetchImpl(`${VIDEOS}?id=${encodeURIComponent(videoId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok && response.status !== 404) throw fail(502, 'YouTube delete failed.');
  return { deleted: true, video_id: videoId };
}

export { AUTH, TOKEN, UPLOAD, VIDEOS, CHANNELS };
