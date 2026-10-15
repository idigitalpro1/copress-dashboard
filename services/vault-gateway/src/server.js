// SATCOM vault gateway (DRAFT scaffold, not deployed). See docs/apikeys/DESIGN.md.
import http from 'node:http';
import { randomBytes, createHmac } from 'node:crypto';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { db, audit } from './db.js';
import * as bao from './bao.js';
import {
  validKeyName, newBotToken, parseBotToken, sha256, safeEqualHex, tokenAllows,
  newRecoveryCodes, hashRecovery, checkRecovery, stepUpFresh,
} from './scopes.js';

const { RP_ID, RP_ORIGIN, ALLOWED_ORIGIN, SESSION_SECRET, ENROLL_TOKEN, PORT = '8080' } = process.env;
for (const k of ['RP_ID', 'RP_ORIGIN', 'ALLOWED_ORIGIN', 'SESSION_SECRET', 'BAO_ADDR', 'BAO_GATEWAY_TOKEN']) {
  if (!process.env[k]) { console.error(`missing env ${k}`); process.exit(1); }
}
if (!RP_ORIGIN.startsWith('https://')) { console.error('RP_ORIGIN must be https'); process.exit(1); }

const IDLE_MS = 15 * 60_000, MAX_MS = 8 * 3600_000;
const sessions = new Map();   // sid -> {createdAt, seenAt, stepUpAt, passkeyId}
const challenges = new Map(); // sid-or-ip -> challenge (short-lived)
const OWNER_ID = new TextEncoder().encode('patrick');

// ---------- helpers ----------
const sign = (v) => `${v}.${createHmac('sha256', SESSION_SECRET).update(v).digest('base64url')}`;
const unsign = (s) => { const i = s?.lastIndexOf('.') ?? -1; if (i < 0) return null; const v = s.slice(0, i); return sign(v) === s ? v : null; };
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(p => p[0])); }
function getSession(req) {
  const sid = unsign(cookies(req).sv_sid); const s = sid && sessions.get(sid); const now = Date.now();
  if (!s || now - s.seenAt > IDLE_MS || now - s.createdAt > MAX_MS) { if (sid) sessions.delete(sid); return null; }
  s.seenAt = now; s.sid = sid; return s;
}
function newSession(res, passkeyId) {
  const sid = randomBytes(32).toString('base64url'); const now = Date.now();
  sessions.set(sid, { createdAt: now, seenAt: now, stepUpAt: now, passkeyId });
  res.setHeader('Set-Cookie', `sv_sid=${sign(sid)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_MS / 1000}`);
}
function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readJson(req) { let b = ''; for await (const c of req) { b += c; if (b.length > 64_000) throw new Error('too large'); } return b ? JSON.parse(b) : {}; }
const ctx = (req) => ({ ip: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress, ua: req.headers['user-agent'] || '' });
const passkeys = () => db.prepare('SELECT * FROM passkeys WHERE revoked_at IS NULL').all();

// ---------- WebAuthn ----------
async function regOptions(req, res, s, body) {
  const none = passkeys().length === 0;
  const viaEnroll = none && ENROLL_TOKEN && body.enrollToken === ENROLL_TOKEN;
  const viaRecovery = body.recoveryCode && db.prepare('SELECT hash FROM recovery_codes WHERE used_at IS NULL').all().some(r => checkRecovery(body.recoveryCode, r.hash));
  if (!viaEnroll && !viaRecovery && !stepUpFresh(s)) return send(res, 403, { error: 'enroll token, recovery code or fresh passkey required' });
  const opts = await generateRegistrationOptions({
    rpName: 'SATCOM Vault', rpID: RP_ID, userID: OWNER_ID, userName: 'patrick',
    attestationType: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: passkeys().map(p => ({ id: p.id })),
  });
  challenges.set(`reg:${ctx(req).ip}`, { challenge: opts.challenge, viaRecovery: !!viaRecovery, code: body.recoveryCode, at: Date.now() });
  send(res, 200, opts);
}
async function regVerify(req, res, s, body) {
  const key = `reg:${ctx(req).ip}`; const c = challenges.get(key); challenges.delete(key);
  if (!c || Date.now() - c.at > 120_000) return send(res, 400, { error: 'challenge expired' });
  const v = await verifyRegistrationResponse({ response: body.response, expectedChallenge: c.challenge, expectedOrigin: RP_ORIGIN, expectedRPID: RP_ID, requireUserVerification: true });
  if (!v.verified) { audit({ actor: 'anon', action: 'passkey.register', ...ctx(req), result: 'denied' }); return send(res, 401, { error: 'not verified' }); }
  const now = new Date().toISOString(); const cred = v.registrationInfo.credential;
  if (c.viaRecovery) { // recovery: burn the code, revoke all other passkeys + sessions
    for (const r of db.prepare('SELECT hash FROM recovery_codes WHERE used_at IS NULL').all()) if (checkRecovery(c.code, r.hash)) db.prepare('UPDATE recovery_codes SET used_at=? WHERE hash=?').run(now, r.hash);
    db.prepare('UPDATE passkeys SET revoked_at=? WHERE revoked_at IS NULL').run(now); sessions.clear();
  }
  const first = passkeys().length === 0 && !c.viaRecovery;
  db.prepare('INSERT INTO passkeys (id,public_key,counter,transports,label,created_at) VALUES (?,?,?,?,?,?)')
    .run(cred.id, Buffer.from(cred.publicKey), cred.counter, JSON.stringify(cred.transports || []), body.label || 'passkey', now);
  let codes;
  if (first) { codes = newRecoveryCodes(); for (const code of codes) db.prepare('INSERT INTO recovery_codes (hash) VALUES (?)').run(hashRecovery(code)); }
  audit({ actor: `passkey:${cred.id.slice(0, 8)}`, action: c.viaRecovery ? 'passkey.recover' : 'passkey.register', ...ctx(req), result: 'ok' });
  newSession(res, cred.id);
  send(res, 200, { ok: true, recoveryCodes: codes }); // codes shown once, only on first enrollment
}
async function authOptions(req, res) {
  const opts = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'required', allowCredentials: passkeys().map(p => ({ id: p.id })) });
  challenges.set(`auth:${ctx(req).ip}`, { challenge: opts.challenge, at: Date.now() });
  send(res, 200, opts);
}
async function authVerify(req, res, s, body) {
  const key = `auth:${ctx(req).ip}`; const c = challenges.get(key); challenges.delete(key);
  const pk = passkeys().find(p => p.id === body.response?.id);
  if (!c || !pk || Date.now() - c.at > 120_000) { audit({ actor: 'anon', action: 'login', ...ctx(req), result: 'denied' }); return send(res, 401, { error: 'denied' }); }
  const v = await verifyAuthenticationResponse({
    response: body.response, expectedChallenge: c.challenge, expectedOrigin: RP_ORIGIN, expectedRPID: RP_ID, requireUserVerification: true,
    credential: { id: pk.id, publicKey: new Uint8Array(pk.public_key), counter: pk.counter, transports: JSON.parse(pk.transports || '[]') },
  });
  if (!v.verified) { audit({ actor: 'anon', action: 'login', ...ctx(req), result: 'denied' }); return send(res, 401, { error: 'denied' }); }
  db.prepare('UPDATE passkeys SET counter=? WHERE id=?').run(v.authenticationInfo.newCounter, pk.id);
  if (s) { s.stepUpAt = Date.now(); } else newSession(res, pk.id);
  audit({ actor: `passkey:${pk.id.slice(0, 8)}`, action: s ? 'stepup' : 'login', ...ctx(req), result: 'ok' });
  send(res, 200, { ok: true });
}

// ---------- key routes (owner) ----------
const actorOf = (s) => `passkey:${s.passkeyId.slice(0, 8)}`;
async function keys(req, res, s, body, parts) {
  const name = parts[2]; const op = parts[3]; const c = ctx(req); const actor = actorOf(s);
  const needStep = (req.method === 'POST' && op) || req.method === 'DELETE';
  if (needStep && !stepUpFresh(s)) return send(res, 401, { error: 'step-up required' });
  if (name && !validKeyName(name)) return send(res, 400, { error: 'bad key name' });
  if (req.method === 'GET' && !name) {
    const names = await bao.listKeys();
    const out = await Promise.all(names.map(async n => { const m = (await bao.meta(n))?.data; return { name: n, version: m?.current_version, updated: m?.updated_time, service: m?.custom_metadata?.service, owner: m?.custom_metadata?.owner }; }));
    audit({ actor, action: 'list', ...c, result: 'ok' }); return send(res, 200, { keys: out });
  }
  if (req.method === 'POST' && !name) {
    if (!validKeyName(body.name) || typeof body.value !== 'string' || !body.value) return send(res, 400, { error: 'name and value required' });
    await bao.create(body.name, { value: body.value, service: body.service || '', owner: body.owner || '', notes: body.notes || '' });
    audit({ actor, action: 'add', key_name: body.name, ...c, result: 'ok' }); return send(res, 201, { ok: true });
  }
  if (req.method === 'POST' && op === 'reveal') {
    const d = await bao.read(name); if (!d) return send(res, 404, { error: 'not found' });
    audit({ actor, action: body.copy ? 'copy' : 'reveal', key_name: name, ...c, result: 'ok' });
    return send(res, 200, { name, value: d.data.value, version: d.metadata.version });
  }
  if (req.method === 'POST' && op === 'rotate') {
    if (typeof body.value !== 'string' || !body.value) return send(res, 400, { error: 'value required' });
    const cur = await bao.read(name); if (!cur) return send(res, 404, { error: 'not found' });
    await bao.rotate(name, { ...cur.data, value: body.value });
    audit({ actor, action: 'rotate', key_name: name, ...c, result: 'ok' }); return send(res, 200, { ok: true });
  }
  if (req.method === 'DELETE' && name) {
    const destroy = new URL(req.url, 'http://x').searchParams.get('destroy') === 'true';
    await (destroy ? bao.destroyAll(name) : bao.softDelete(name));
    audit({ actor, action: destroy ? 'destroy' : 'delete', key_name: name, ...c, result: 'ok' }); return send(res, 200, { ok: true });
  }
  send(res, 405, { error: 'method' });
}

// ---------- bot tokens ----------
async function tokens(req, res, s, body, parts) {
  const actor = actorOf(s); const c = ctx(req);
  if (req.method === 'GET') return send(res, 200, { tokens: db.prepare('SELECT id,name,scopes,created_at,expires_at,revoked_at,last_used_at FROM bot_tokens').all().map(t => ({ ...t, scopes: JSON.parse(t.scopes) })) });
  if (!stepUpFresh(s)) return send(res, 401, { error: 'step-up required' });
  if (req.method === 'POST') {
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter(validKeyName) : [];
    if (!body.name || !scopes.length) return send(res, 400, { error: 'name and scopes required' });
    const t = newBotToken(); const days = Math.min(Number(body.days) || 90, 365);
    db.prepare('INSERT INTO bot_tokens (id,name,hash,scopes,created_at,expires_at) VALUES (?,?,?,?,?,?)')
      .run(t.id, String(body.name).slice(0, 64), t.hash, JSON.stringify(scopes), new Date().toISOString(), new Date(Date.now() + days * 864e5).toISOString());
    audit({ actor, action: 'token.issue', key_name: scopes.join(','), ...c, result: `ok:${t.id}` });
    return send(res, 201, { id: t.id, token: t.token }); // shown once
  }
  if (req.method === 'DELETE' && parts[2]) {
    db.prepare('UPDATE bot_tokens SET revoked_at=? WHERE id=?').run(new Date().toISOString(), parts[2]);
    audit({ actor, action: 'token.revoke', ...c, result: `ok:${parts[2]}` }); return send(res, 200, { ok: true });
  }
  send(res, 405, { error: 'method' });
}
const rate = new Map();
async function botRead(req, res, parts) {
  const c = ctx(req); const t = parseBotToken(req.headers.authorization); const name = parts[3];
  const row = t && db.prepare('SELECT * FROM bot_tokens WHERE id=?').get(t.id);
  const ok = row && safeEqualHex(sha256(t.secret), row.hash) && tokenAllows({ ...row, scopes: JSON.parse(row.scopes) }, name);
  const minute = Math.floor(Date.now() / 60_000); const rk = `${t?.id}:${minute}`; rate.set(rk, (rate.get(rk) || 0) + 1);
  if (rate.get(rk) > 60) return send(res, 429, { error: 'rate' });
  if (!ok) { audit({ actor: `token:${t?.id || 'none'}`, action: 'bot.read', key_name: name, ...c, result: 'denied' }); return send(res, 403, { error: 'denied' }); }
  const d = await bao.read(name); if (!d) return send(res, 404, { error: 'not found' });
  db.prepare('UPDATE bot_tokens SET last_used_at=? WHERE id=?').run(new Date().toISOString(), row.id);
  audit({ actor: `token:${row.id}`, action: 'bot.read', key_name: name, ...c, result: 'ok' });
  send(res, 200, { name, value: d.data.value, version: d.metadata.version });
}

// ---------- router ----------
http.createServer(async (req, res) => {
  try {
    const origin = req.headers.origin;
    if (origin === ALLOWED_ORIGIN) {
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const parts = new URL(req.url, 'http://x').pathname.split('/').filter(Boolean); // ['v1', ...]
    if (parts[0] === 'healthz') return send(res, 200, { ok: true });
    if (parts[0] !== 'v1') return send(res, 404, { error: 'not found' });
    if (parts[1] === 'bot' && parts[2] === 'keys' && req.method === 'GET') return botRead(req, res, parts);
    // Browser routes: require the SATCOM origin (CSRF guard on top of SameSite=Strict).
    if (req.method !== 'GET' && origin !== ALLOWED_ORIGIN) return send(res, 403, { error: 'origin' });
    const body = req.method === 'POST' ? await readJson(req) : {};
    const s = getSession(req);
    if (parts[1] === 'webauthn') {
      const a = parts.slice(2).join('/');
      if (a === 'status') return send(res, 200, { enrolled: passkeys().length > 0, signedIn: !!s });
      if (a === 'register/options') return regOptions(req, res, s, body);
      if (a === 'register/verify') return regVerify(req, res, s, body);
      if (a === 'auth/options') return authOptions(req, res);
      if (a === 'auth/verify') return authVerify(req, res, s, body);
      if (a === 'logout') { if (s) sessions.delete(s.sid); return send(res, 200, { ok: true }); }
    }
    if (!s) return send(res, 401, { error: 'sign in with passkey' });
    if (parts[1] === 'keys') return keys(req, res, s, body, parts);
    if (parts[1] === 'tokens') return tokens(req, res, s, body, parts);
    if (parts[1] === 'audit') return send(res, 200, { audit: db.prepare('SELECT * FROM audit ORDER BY seq DESC LIMIT ?').all(Math.min(Number(new URL(req.url, 'http://x').searchParams.get('limit')) || 100, 1000)) });
    send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('gateway error', err.message); // never log bodies
    send(res, 500, { error: 'internal' });
  }
}).listen(Number(PORT), () => console.log(`vault-gateway on :${PORT}`));
