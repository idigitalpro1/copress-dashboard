import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { capture, seal, unseal, summary, classify } from '../lib/credential-intake.js';
import { createHandler } from '../api/credential-inbox.js';
const fakeKey = 'AIza' + 'x'.repeat(35);
function setup(overrides = {}) {
  const env = { VAULT_OPERATOR_TOKEN: 'test-only-operator-'.repeat(3), VAULT_ENCRYPTION_KEY: randomBytes(32).toString('base64'), VAULT_BLOB_READ_WRITE_TOKEN: 'test-only-blob-token', ...overrides };
  const saved = new Map(); const calls = [];
  const storage = {
    async put(path, body, options) { calls.push('put'); assert.equal(options.access, 'private'); assert.equal(options.allowOverwrite, false); saved.set(path, body); },
    async list() { calls.push('list'); return { blobs: [...saved.keys()].map(pathname => ({ pathname })), hasMore: false }; },
    async get(path, options) { calls.push('get'); assert.equal(options.access, 'private'); return saved.has(path) ? { statusCode: 200, stream: new Blob([saved.get(path)]).stream() } : null; }
  };
  return { env, saved, calls, storage, handler: createHandler({ env, storage }) };
}
async function invoke(ctx, { method = 'GET', url = '/api/credential-inbox', body, auth = true, origin = 'https://satcom.conews.press', stream = false } = {}) {
  const req = Readable.from(stream ? [body] : []); req.method = method; req.url = url;
  req.headers = { 'content-type': 'application/json', origin, ...(auth ? { authorization: `Bearer ${ctx.env.VAULT_OPERATOR_TOKEN}` } : {}) };
  if (!stream) req.body = body;
  const res = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, end(value) { this.body = JSON.parse(value); } };
  await ctx.handler(req, res); return res;
}
test('unknown entries and exact original text survive encrypted capture', () => {
  const raw = '  unknown-secret\nproject name: test\n'; const record = capture({ raw }); const key = randomBytes(32);
  const encrypted = seal(record, key); assert.ok(!encrypted.includes('unknown-secret')); assert.deepEqual(unseal(encrypted, record.id, key), record);
  assert.equal(summary(record).raw, undefined); assert.equal(record.status, 'saved-unassigned');
  assert.throws(() => unseal(encrypted, record.id, randomBytes(32)));
  assert.throws(() => unseal(encrypted, 'wrong-id', key));
  const tampered = JSON.parse(encrypted); tampered.ciphertext = Buffer.from('tampered').toString('base64');
  assert.throws(() => unseal(JSON.stringify(tampered), record.id, key));
});
test('Google detection does not guess Gemini, Places or Plesk destination', () => {
  const result = classify(`API key name: new\n${fakeKey}\nGOOGLE_PROJECT_NUMBER=123`);
  assert.equal(result.provider, 'Google'); assert.deepEqual(result.candidates, []); assert.deepEqual(result.fields, ['GOOGLE_PROJECT_NUMBER']);
  assert.equal(classify(JSON.stringify({ type: 'service_account', private_key: 'fake', client_email: 'test@example.com' })).kind, 'Service account JSON');
  assert.equal(classify(JSON.stringify({ installed: { client_secret: 'fake' } })).kind, 'OAuth client JSON');
});
test('unauthenticated, cross-origin and unconfigured requests never touch storage', async () => {
  for (const [overrides, request, status] of [[{}, { auth: false },401],[{}, {origin:'https://other.example'},403],[{VAULT_OPERATOR_TOKEN:''},{},503],[{VAULT_ENCRYPTION_KEY:'bad'},{},503],[{VAULT_BLOB_READ_WRITE_TOKEN:''},{},503]]) {
    const ctx = setup(overrides); const res = await invoke(ctx, request); assert.equal(res.statusCode, status); assert.deepEqual(ctx.calls, []); assert.equal(res.headers['Cache-Control'], 'no-store');
  }
});
test('save, metadata-only list and deliberate single-entry recovery', async () => {
  const ctx = setup(); const raw = `GOOGLE_API_KEY="${fakeKey}"\n`;
  const saved = await invoke(ctx, { method: 'POST', body: JSON.stringify({ label: 'Google test', raw }), stream: true });
  assert.equal(saved.statusCode,201); assert.ok(!JSON.stringify(saved.body).includes(fakeKey));
  const id = saved.body.record.id; const list = await invoke(ctx); assert.equal(list.body.records.length,1); assert.ok(!JSON.stringify(list.body).includes(fakeKey));
  assert.ok(![...ctx.saved.values()][0].includes(fakeKey));
  const recovered = await invoke(ctx, { url: `/api/credential-inbox?id=${id}` }); assert.equal(recovered.body.raw,raw); assert.match(recovered.headers['Content-Disposition'], /attachment/);
  const invalid = await invoke(ctx, { url: '/api/credential-inbox?id=../secret' }); assert.equal(invalid.statusCode,400);
});
test('malformed and oversized entries rejected; failure never claims saved or leaks', async () => {
  const ctx = setup();
  for (const body of ['{bad', {raw:''}, {raw:'x'.repeat(65537)}, {raw:'abc',label:{bad:true}}]) assert.equal((await invoke(ctx,{method:'POST',body})).statusCode,400);
  assert.equal((await invoke(ctx,{method:'POST',body:'x'.repeat(100001),stream:true})).statusCode,413);
  ctx.storage.put = async () => { throw new Error(fakeKey); };
  const res = await invoke(ctx,{method:'POST',body:{raw:fakeKey}}); assert.equal(res.statusCode,502); assert.ok(!JSON.stringify(res.body).includes(fakeKey));
});
