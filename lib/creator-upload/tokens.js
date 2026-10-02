import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function hashToken(token) {
  return createHash('sha256').update(`creator-upload-v1:${token}`).digest('hex');
}

export function generateToken() {
  return randomBytes(32).toString('hex');
}

function ctxField(value, max) {
  return String(value).replace(/[\u0000-\u001f\u007f|=]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeCreator({ slug, name, token }) {
  const cleanSlug = String(slug || '').trim();
  const cleanName = ctxField(name, 80);
  const cleanToken = String(token || '').trim();
  if (!SLUG.test(cleanSlug) || cleanSlug.length > 40) return null;
  if (cleanName.length < 2) return null;
  if (!TOKEN_PATTERN.test(cleanToken)) return null;
  return { slug: cleanSlug, name: cleanName, token: cleanToken, token_hash: hashToken(cleanToken) };
}

function parseJsonTokens(raw) {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(row => normalizeCreator({
    slug: row?.slug || row?.creator || row?.id,
    name: row?.name || row?.label || row?.creator_name,
    token: row?.token,
  })).filter(Boolean);
}

function parseLineTokens(raw) {
  const found = [];
  for (const part of String(raw).split(/[\n;]+/)) {
    const line = part.trim();
    if (!line || line.startsWith('#')) continue;
    const pieces = line.split('|').map(s => s.trim());
    if (pieces.length < 3) continue;
    const [slug, name, ...rest] = pieces;
    const token = rest.join('|');
    const row = normalizeCreator({ slug, name, token });
    if (row) found.push(row);
  }
  return found;
}

export function parseCreatorTokens(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const text = raw.trim();
  if (text.startsWith('[')) {
    try { return parseJsonTokens(text); } catch { /* fall through to line format */ }
  }
  return parseLineTokens(text);
}

function hashesEqual(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === 32 && y.length === 32 && timingSafeEqual(x, y);
}

export function matchEnvToken(env, candidate) {
  if (typeof candidate !== 'string' || !TOKEN_PATTERN.test(candidate)) return null;
  const want = hashToken(candidate);
  for (const row of parseCreatorTokens(env.CREATOR_UPLOAD_TOKENS)) {
    if (hashesEqual(row.token_hash, want)) return { slug: row.slug, name: row.name, source: 'env' };
  }
  return null;
}

async function matchTableToken(env, candidate, fetchImpl = fetch) {
  if (typeof candidate !== 'string' || !TOKEN_PATTERN.test(candidate)) return null;
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!base || !key || !/^https:\/\//.test(base)) return null;
  const hash = hashToken(candidate);
  const url = `${base}/rest/v1/creator_upload_tokens?token_hash=eq.${encodeURIComponent(hash)}&revoked_at=is.null&select=creator_slug,creator_name&limit=1`;
  try {
    const response = await fetchImpl(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    const slug = row?.creator_slug;
    const name = row?.creator_name;
    const parsed = normalizeCreator({ slug, name, token: candidate });
    return parsed ? { slug: parsed.slug, name: parsed.name, source: 'table' } : null;
  } catch {
    return null;
  }
}

export async function resolveCreatorToken(env, candidate, fetchImpl = fetch) {
  return matchEnvToken(env, candidate) || matchTableToken(env, candidate, fetchImpl);
}

export function incomingPublicId(slug, title, now = Date.now(), entropy = randomBytes(4).toString('hex')) {
  const stamp = new Date(now).toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const stem = String(title || 'clip').toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'clip';
  return `satcom/${slug}/incoming/${stem}-${stamp}-${entropy}`;
}

export { ctxField };
