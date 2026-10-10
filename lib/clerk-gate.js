// SATCOM Clerk gate: shared by middleware.js (operator pages) and Clerk-protected API routes.
// Same Clerk app as billing.conews.press / invoice manager / NewsFlow. Keys come from env only.
// Fails CLOSED: missing keys -> 503, signed out -> sign-in redirect (pages) or 401 (APIs),
// signed in but not on ALLOWED_EMAILS (verified addresses only) -> 403.
import { createClerkClient } from '@clerk/backend';

// Operator surfaces that require sign-in. Everything else stays as it was: the public
// read-only MCP (/mcp, LOCK-013), /codex + /kanban (public development view), the video
// feed/embed, creator upload links (per-creator tokens), campaign kits and /subscribe pages.
export const GATED_PAGES = [
  '/', '/index', '/index.html',
  '/apistore', '/apistore.html', '/apikeys',
  '/csv-manager', '/csv-manager.html',
  '/linear', '/linear.html',
  '/newsletter', '/newsletter.html',
  '/briefing', '/briefing.html',
  '/video/studio', '/video/studio.html',
];
export const GATED_APIS = ['/api/whoami'];

// Hosts on this Vercel project that must never be gated (QR/subscribe door, LOCK-003).
export const UNGATED_HOSTS = new Set(['subscribe.thevillager.today']);

export function getPublishableKey(env = process.env) {
  return String(env.CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').trim();
}
export function isClerkConfigured(env = process.env) {
  return Boolean(getPublishableKey(env) && String(env.CLERK_SECRET_KEY || '').trim());
}
export function getAllowedEmails(env = process.env) {
  return new Set(String(env.ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean));
}
/** Empty allowlist denies everyone. */
export function isEmailAllowed(verifiedEmails, allowlist) {
  if (!allowlist || allowlist.size === 0) return false;
  return verifiedEmails.some(e => allowlist.has(String(e).trim().toLowerCase()));
}
export function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}
export function needsGate(host, pathname) {
  if (UNGATED_HOSTS.has(String(host || '').toLowerCase().split(':')[0])) return false;
  const p = normalizePath(pathname);
  return GATED_PAGES.includes(p) || GATED_APIS.includes(p);
}
export function isApiPath(pathname) {
  return pathname.startsWith('/api/');
}
/** Only same-origin relative redirect targets are honoured after sign-in. */
export function safeRedirectPath(value) {
  const v = String(value || '');
  if (!v.startsWith('/') || v.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(v)) return '/';
  try {
    const origin = 'https://satcom.invalid';
    const url = new URL(v, origin);
    // Dot-segment normalization must not produce a protocol-relative redirect.
    if (url.origin !== origin || url.pathname.startsWith('//')) return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}

let client = null;
let clientKey = '';
function getClient(env) {
  const key = getPublishableKey(env) + '|' + env.CLERK_SECRET_KEY;
  if (!client || clientKey !== key) {
    client = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: getPublishableKey(env) });
    clientKey = key;
  }
  return client;
}

const allowCache = new Map();
const ALLOW_CACHE_MS = 5 * 60 * 1000;
async function lookupAllowed(clerk, userId, env) {
  const hit = allowCache.get(userId);
  if (hit && hit.expires > Date.now()) return hit;
  const user = await clerk.users.getUser(userId);
  const verified = (user.emailAddresses || [])
    .filter(e => e?.verification?.status === 'verified')
    .map(e => String(e.emailAddress || ''));
  const allowlist = getAllowedEmails(env);
  const email = verified.find(e => allowlist.has(e.toLowerCase())) || null;
  const out = { allowed: isEmailAllowed(verified, allowlist), email, expires: Date.now() + ALLOW_CACHE_MS };
  allowCache.set(userId, out);
  return out;
}

/**
 * Authenticate a standard Request.
 * Returns { kind: 'unconfigured' | 'handshake' | 'signed-out' | 'forbidden' | 'ok', ... }.
 */
export async function checkRequest(request, env = process.env) {
  if (!isClerkConfigured(env)) return { kind: 'unconfigured' };
  const clerk = getClient(env);
  const state = await clerk.authenticateRequest(request);
  const location = state.headers && state.headers.get('location');
  if (location) return { kind: 'handshake', headers: state.headers };
  const auth = typeof state.toAuth === 'function' ? state.toAuth() : null;
  const userId = auth && auth.userId;
  if (!userId) return { kind: 'signed-out' };
  const decision = await lookupAllowed(clerk, userId, env);
  if (!decision.allowed) return { kind: 'forbidden', userId };
  return { kind: 'ok', userId, email: decision.email };
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}
function page(status, title, message) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)} — SATCOM</title><style>body{font-family:system-ui,sans-serif;background:#0b1020;color:#e8ecf5;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:460px;padding:28px;border:1px solid #2a3350;border-radius:16px;background:#121a30;text-align:center}a{color:#8fb4ff}</style></head><body><main><h1>${esc(title)}</h1><p>${esc(message)}</p><p><a href="/sign-in">Sign in</a> · <a href="/codex">Public SATCOM / Codex</a></p></main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } }
  );
}

/** Build the denial Response for a check result, or null when the request may continue. */
export function denialResponse(result, request) {
  const url = new URL(request.url);
  const api = isApiPath(url.pathname);
  switch (result.kind) {
    case 'ok':
      return null;
    case 'handshake':
      return new Response(null, { status: 307, headers: result.headers });
    case 'unconfigured':
      return api
        ? json(503, { error: 'Sign-in is not configured on this deployment (Clerk keys missing).' })
        : page(503, 'Sign-in is not configured', 'This deployment is missing its Clerk keys, so SATCOM operator pages stay locked.');
    case 'forbidden':
      return api
        ? json(403, { error: 'Forbidden: this account is not on the SATCOM allowlist.' })
        : new Response(null, { status: 302, headers: { Location: '/sign-in?forbidden=1', 'Cache-Control': 'no-store' } });
    default: {
      if (api) return json(401, { error: 'Unauthorized: sign in to SATCOM.' }, { 'WWW-Authenticate': 'Bearer realm="satcom"' });
      const target = '/sign-in?redirect_url=' + encodeURIComponent(url.pathname + url.search);
      return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store' } });
    }
  }
}

/** Node (req,res) helper for API routes: returns the auth result or writes the denial. */
export async function guardNodeRequest(req, res, env = process.env) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
  const request = new Request(`${proto}://${host}${req.url}`, { method: req.method, headers });
  let result;
  try {
    result = await checkRequest(request, env);
  } catch (err) {
    console.error('SATCOM Clerk check failed:', err && err.message);
    result = { kind: 'signed-out' };
  }
  if (result.kind === 'handshake') result = { kind: 'signed-out' };
  const denial = denialResponse(result, request);
  if (!denial) return result;
  res.statusCode = denial.status;
  denial.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(await denial.text());
  return null;
}
