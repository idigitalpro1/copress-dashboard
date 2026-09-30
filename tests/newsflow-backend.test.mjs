import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createNewsflowApp } from '../services/mcp-vault/server.ts';
import { encryptApiKey, decryptApiKey, requireNewsflowConfig } from '../services/mcp-vault/server/crypto.ts';
import { getAllKeys, saveAllKeys, getAllPrompts, getAllSecurityLogs, saveAllSecurityLogs } from '../services/mcp-vault/server/storage.ts';
import { importKeysFromEnv } from '../services/mcp-vault/server/env-importer.ts';
import { validateApiKey, executeLlmPrompt } from '../services/mcp-vault/server/providers.ts';
import { executePromptRequest } from '../services/mcp-vault/server/execution.ts';

const token = 'FAKE_LOCAL_OPERATOR_TOKEN_1234567890';
const secret = 'FAKE_PROVIDER_CREDENTIAL_1234567890';
const envNames = ['NEWSFLOW_BETA_ENABLED', 'NEWSFLOW_MCP_TOKEN', 'NEWSFLOW_MASTER_KEY', 'NEWSFLOW_DATA_DIR', 'NEWSFLOW_ALLOWED_ORIGINS', 'NEWSFLOW_ALLOW_EXECUTION', 'GEMINI_API_KEY'];
let originalEnv, originalFetch, dataDir, server, basePort;
beforeEach(async () => {
  originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'newsflow-backend-test-'));
  Object.assign(process.env, { NEWSFLOW_BETA_ENABLED: '1', NEWSFLOW_MCP_TOKEN: token,
    NEWSFLOW_MASTER_KEY: 'ab'.repeat(32), NEWSFLOW_DATA_DIR: dataDir, GEMINI_API_KEY: 'FAKE_MUST_NOT_AUTO_IMPORT_12345678' });
  delete process.env.NEWSFLOW_ALLOWED_ORIGINS; delete process.env.NEWSFLOW_ALLOW_EXECUTION;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Tests must not contact a provider.'); };
  server = http.createServer(createNewsflowApp());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  basePort = server.address().port;
});
afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(originalEnv)) value === undefined ? delete process.env[name] : process.env[name] = value;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function request(url, { method = 'GET', body, headers = {}, auth = true } = {}) {
  const content = typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: basePort, path: url, method,
      headers: { ...(auth ? { authorization: `Bearer ${token}` } : {}), ...(content === undefined ? {} : { 'content-type': 'application/json' }), ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json; try { json = JSON.parse(text); } catch { json = null; }
        resolve({ status: res.statusCode, json, text, headers: res.headers });
      });
    });
    req.on('error', reject); req.end(content);
  });
}
function keyFixture(overrides = {}) {
  return { id: 'key-fake-123', label: 'Offline test credential', provider: 'openai', maskedKey: '••••••••••••',
    encryptedData: encryptApiKey(secret), status: 'active', validationMessage: 'Test fixture', isDefault: true,
    usageCount: 0, createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z', ...overrides };
}

test('configuration is explicit and request authentication precedes JSON parsing and storage', async () => {
  assert.equal((await request('/api/vault/keys', { auth: false })).status, 401);
  assert.equal((await request('/api/vault/validate-and-save', { auth: false, method: 'POST', body: '{invalid' })).status, 401);
  assert.equal((await request('/api/vault/keys', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.deepEqual(fs.readdirSync(dataDir), []);
  delete process.env.NEWSFLOW_MASTER_KEY;
  assert.equal((await request('/api/vault/keys')).status, 503);
  assert.throws(requireNewsflowConfig, /required private configuration/);
  assert.deepEqual(fs.readdirSync(dataDir), []);
});

test('only exact allowed origins and native no-Origin requests are accepted', async () => {
  assert.equal((await request('/api/vault/keys', { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/api/vault/keys', { headers: { origin: 'http://localhost:4321.evil.example' } })).status, 403);
  const allowed = await request('/api/vault/keys', { headers: { origin: 'http://localhost:4321' } });
  assert.equal(allowed.status, 200); assert.equal(allowed.headers['cache-control'], 'no-store');
  assert.equal((await request('/api/vault/keys')).status, 200);
  process.env.NEWSFLOW_ALLOWED_ORIGINS = 'https://beta.example';
  assert.equal((await request('/api/vault/keys', { headers: { origin: 'https://beta.example' } })).status, 200);
  process.env.NEWSFLOW_ALLOWED_ORIGINS = 'https://beta.example/path';
  assert.equal((await request('/api/vault/keys')).status, 503);
});

test('server environment is never scanned, imported, or validated', async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error(); };
  const status = await request('/api/vault/environment-status');
  assert.equal(status.status, 200); assert.equal(status.json.hasEnvGeminiKey, false);
  assert.deepEqual(status.json.detectedKeys, []); assert.equal(status.json.executionEnabled, false);
  assert.equal((await request('/api/vault/env-candidates')).status, 410);
  assert.equal((await request('/api/vault/import-selected-env', { method: 'POST', body: {} })).status, 410);
  assert.deepEqual((await request('/api/vault/keys')).json.keys, []);
  assert.equal(calls, 0); assert.equal(status.text.includes(process.env.GEMINI_API_KEY), false);
  assert.equal(fs.existsSync(path.join(dataDir, 'keys.json')), false);
});

test('save encrypts atomically with private permissions, masks all bytes, and records a safe audit event', async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error(); };
  const result = await request('/api/vault/validate-and-save', { method: 'POST', body: { rawKey: secret, providerHint: 'openai', label: 'Copy desk', sourceEnvVar: 'OPENAI_API_KEY' } });
  assert.equal(result.status, 201); assert.equal(result.json.key.status, 'untested'); assert.equal(calls, 0);
  assert.equal(result.text.includes(secret), false); assert.equal('encryptedData' in result.json.key, false);
  assert.equal(result.json.key.maskedKey, '••••••••••••');
  assert.equal(decryptApiKey(getAllKeys()[0].encryptedData), secret);
  const file = path.join(dataDir, 'keys.json');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600); assert.equal(fs.statSync(dataDir).mode & 0o777, 0o700);
  assert.equal(fs.readFileSync(file, 'utf8').includes(secret), false);
  assert.equal(fs.readdirSync(dataDir).some(name => /master|\.tmp/.test(name)), false);
  assert.ok(getAllSecurityLogs().some(item => item.action === 'KEY_CREATED'));
  assert.equal(JSON.stringify(getAllSecurityLogs()).includes(secret), false);
  const duplicate = await request('/api/vault/validate-and-save', { method: 'POST', body: { rawKey: secret, providerHint: 'openai' } });
  assert.equal(duplicate.json.duplicate, true); assert.equal(getAllKeys().length, 1);
});

test('AES-GCM tamper and wrong master key fail without silently resetting stored data', () => {
  const cipher = encryptApiKey(secret);
  assert.equal(decryptApiKey(cipher), secret); assert.notEqual(cipher, encryptApiKey(secret));
  const parts = cipher.split(':'); parts[1] = (parts[1][0] === '0' ? '1' : '0') + parts[1].slice(1);
  assert.throws(() => decryptApiKey(parts.join(':')), /could not be authenticated/);
  saveAllKeys([keyFixture()]); const before = fs.readFileSync(path.join(dataDir, 'keys.json'), 'utf8');
  process.env.NEWSFLOW_MASTER_KEY = 'cd'.repeat(32);
  assert.throws(() => decryptApiKey(getAllKeys()[0].encryptedData), /could not be authenticated/);
  assert.equal(fs.readFileSync(path.join(dataDir, 'keys.json'), 'utf8'), before);
});

test('corrupt data and symlinks fail closed without overwriting the existing contents', async () => {
  const file = path.join(dataDir, 'keys.json'); fs.writeFileSync(file, '{invalid', { mode: 0o600 });
  const result = await request('/api/vault/validate-and-save', { method: 'POST', body: { rawKey: secret } });
  assert.equal(result.status, 503); assert.equal(fs.readFileSync(file, 'utf8'), '{invalid');
  fs.unlinkSync(file); fs.symlinkSync(path.join(dataDir, 'target.json'), file);
  fs.writeFileSync(path.join(dataDir, 'target.json'), '[]');
  assert.throws(getAllKeys, /could not be read/);
  assert.throws(() => saveAllKeys([]), /could not be saved/);
  assert.equal(fs.readFileSync(path.join(dataDir, 'target.json'), 'utf8'), '[]');
  fs.unlinkSync(path.join(dataDir, 'target.json'));
  assert.throws(getAllKeys, /could not be read/);
  assert.throws(() => saveAllKeys([]), /could not be saved/);
});

test('storage refuses the public repository and filesystem root without modifying them', () => {
  process.env.NEWSFLOW_DATA_DIR = process.cwd();
  assert.throws(getAllKeys, /Private vault storage is unavailable/);
  process.env.NEWSFLOW_DATA_DIR = path.parse(dataDir).root;
  assert.throws(getAllKeys, /Private vault storage is unavailable/);
});

test('selected env import previews masked metadata, saves only on explicit confirmation, and deduplicates', () => {
  const entries = [{ envVarName: 'OPENAI_API_KEY', value: 'sk-proj-FAKE_1234567890', provider: 'openai' },
    { envVarName: 'EDITORIAL_TOKEN', value: 'FAKE_value=with#symbols/+', provider: 'custom' }];
  const preview = importKeysFromEnv({ entries });
  assert.equal(preview.preview.entries.length, 2); assert.equal(JSON.stringify(preview).includes(entries[0].value), false);
  assert.equal(fs.existsSync(path.join(dataDir, 'keys.json')), false);
  const result = importKeysFromEnv({ entries, confirm: true });
  assert.equal(result.importResult.imported.length, 2); assert.equal(getAllKeys().every(item => item.status === 'untested'), true);
  assert.equal(decryptApiKey(getAllKeys()[1].encryptedData), entries[1].value);
  assert.equal(importKeysFromEnv({ entries, confirm: true }).importResult.imported.length, 0);
  assert.equal(getAllKeys().length, 2);
  assert.equal(JSON.stringify(result).includes(entries[1].value), false);
});

test('unsafe or conflicting env entries cannot silently choose a provider or partly import', () => {
  assert.throws(() => importKeysFromEnv({ entries: [{ envVarName: 'NEWSFLOW_MASTER_KEY', value: secret, provider: 'custom' }], confirm: true }), /unsupported/);
  assert.throws(() => importKeysFromEnv({ envContent: 'OPENAI_API_KEY=xai-FAKE_1234567890', confirm: true }), /Explicitly select/);
  assert.throws(() => importKeysFromEnv({ envContent: 'OPENAI_API_KEY=sk-proj-FAKE_1234567890\nMALFORMED', confirm: true }), /Resolve import/);
  assert.deepEqual(getAllKeys(), []);
  const accepted = importKeysFromEnv({ envContent: 'OPENAI_API_KEY=xai-FAKE_1234567890', providerOverrides: { OPENAI_API_KEY: 'custom' }, confirm: true });
  assert.equal(accepted.keys[0].provider, 'custom');
  assert.equal(accepted.keys[0].envVarName, 'OPENAI_API_KEY');
});

test('raw credentials are rejected when supplied as public labels or source names', async () => {
  const result = await request('/api/vault/validate-and-save', { method: 'POST', body: { rawKey: secret, label: secret } });
  assert.equal(result.status, 400); assert.equal(result.text.includes(secret), false);
  const named = await request('/api/vault/validate-and-save', { method: 'POST', body: { rawKey: 'SECRET_KEY', sourceEnvVar: 'SECRET_KEY' } });
  assert.equal(named.status, 400); assert.equal(named.text.includes('SECRET_KEY'), false);
  assert.deepEqual(getAllKeys(), []);
});

test('validation uses only fixed HTTPS URLs, secret headers, and blocked redirects; provider errors stay generic', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response(secret, { status: 401 }); };
  const result = await validateApiKey(secret, 'gemini');
  assert.equal(result.isValid, false); assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models');
  assert.equal(calls[0].options.headers['x-goog-api-key'], secret); assert.equal(calls[0].options.redirect, 'error');
  await assert.rejects(validateApiKey(secret, 'custom', { endpointUrl: 'http://127.0.0.1/internal' }), /Custom endpoints/);
  assert.equal(calls.length, 1);
  globalThis.fetch = async () => { throw new Error(secret); };
  assert.equal(JSON.stringify(await validateApiKey(secret, 'openai')).includes(secret), false);
});

test('rotation and reactivation return to untested and need another explicit validation', async () => {
  saveAllKeys([keyFixture()]); let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{}'); };
  const rotated = await request('/api/vault/rotate/key-fake-123', { method: 'POST', body: { newRawKey: 'FAKE_NEW_CREDENTIAL_123456' } });
  assert.equal(rotated.json.key.status, 'untested'); assert.equal(calls, 0);
  assert.equal((await request('/api/vault/ping/key-fake-123', { method: 'POST', body: {} })).json.key.status, 'active');
  assert.equal(calls, 1);
  assert.equal((await request('/api/vault/revoke/key-fake-123', { method: 'POST', body: {} })).json.key.status, 'revoked');
  assert.equal((await request('/api/vault/revoke/key-fake-123', { method: 'POST', body: {} })).json.key.status, 'untested');
  const logs = (await request('/api/vault/security-logs')).json;
  assert.equal(logs.stats.rotations, 1); assert.equal(logs.stats.validations, 1); assert.equal(logs.stats.revocations, 1);
});

test('execution requires the feature flag and explicit active mapping, ignoring defaults and server env keys', async () => {
  saveAllKeys([keyFixture()]);
  await assert.rejects(executePromptRequest({ inputText: 'Offline news fixture', keyId: 'key-fake-123' }), error => error.statusCode === 403);
  process.env.NEWSFLOW_ALLOW_EXECUTION = '1';
  await assert.rejects(executePromptRequest({ inputText: 'Offline news fixture' }), /explicit validated key/);
  saveAllKeys([keyFixture({ status: 'untested' })]);
  await assert.rejects(executePromptRequest({ inputText: 'Offline news fixture', keyId: 'key-fake-123' }), error => error.statusCode === 409);
  assert.equal(getAllPrompts().every(prompt => prompt.mappedKeyId === null), true);
});

test('explicit execution preserves workload semantics and cannot overwrite a concurrent rotation', async () => {
  process.env.NEWSFLOW_ALLOW_EXECUTION = '1'; saveAllKeys([keyFixture()]);
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    saveAllKeys([keyFixture({ encryptedData: encryptApiKey('FAKE_ROTATED_KEY_12345678'), status: 'untested', usageCount: 0 })]);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"headline":"Test"}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }));
  };
  const result = await executePromptRequest({ inputText: 'FAKE OCR INPUT', systemPrompt: 'Extract a headline.', userTemplate: 'Preserve the byline.', keyId: 'key-fake-123', modelOverride: 'gpt-4o-mini' });
  assert.equal(sent.url, 'https://api.openai.com/v1/chat/completions'); assert.equal(sent.options.redirect, 'error');
  assert.equal(sent.body.messages[0].content, 'Extract a headline.'); assert.match(sent.body.messages[1].content, /Preserve the byline\.[\s\S]*FAKE OCR INPUT/);
  assert.deepEqual(result.result.structuredData, { headline: 'Test' }); assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(decryptApiKey(getAllKeys()[0].encryptedData), 'FAKE_ROTATED_KEY_12345678');
  assert.equal(getAllKeys()[0].usageCount, 0); assert.equal(getAllKeys()[0].status, 'untested');
  assert.ok(getAllSecurityLogs().some(item => item.action === 'PROMPT_EXECUTED'));
});

test('execution does not expose provider errors or echoed credentials', async () => {
  const params = { provider: 'openai', apiKey: secret, inputText: 'Fake input', systemPrompt: 'Test', userPrompt: '', model: 'gpt-4o-mini' };
  globalThis.fetch = async () => new Response(secret, { status: 500 });
  await assert.rejects(executeLlmPrompt(params), error => error.statusCode === 502 && !error.message.includes(secret));
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: secret } }] }));
  await assert.rejects(executeLlmPrompt(params), error => error.statusCode === 502 && !error.message.includes(secret));
});

test('a completed paid draft survives separate usage persistence failure without inviting a retry', async () => {
  process.env.NEWSFLOW_ALLOW_EXECUTION = '1'; saveAllKeys([keyFixture()]);
  globalThis.fetch = async () => {
    fs.writeFileSync(path.join(dataDir, 'keys.json'), '{invalid');
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"headline":"Completed draft"}' } }] }));
  };
  const result = await executePromptRequest({ inputText: 'Fake OCR input', keyId: 'key-fake-123' });
  assert.equal(result.success, true); assert.equal(result.usageRecorded, false);
  assert.equal(result.result.structuredData.headline, 'Completed draft');
  assert.equal(fs.readFileSync(path.join(dataDir, 'keys.json'), 'utf8'), '{invalid');
});

test('provider concurrency is bounded across validation and execution without a spoofable client identifier', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async () => { await blocked; return new Response('{}'); };
  const active = Array.from({ length: 3 }, () => validateApiKey(secret, 'openai'));
  await assert.rejects(validateApiKey(secret, 'openai'), error => error.statusCode === 429);
  await assert.rejects(executeLlmPrompt({ provider: 'openai', apiKey: secret, inputText: 'Test', systemPrompt: 'Test', userPrompt: '' }), error => error.statusCode === 429);
  release(); await Promise.all(active);
});

test('default selection timestamps only the cards whose default state changes', async () => {
  const oldTimestamp = '2026-01-01T00:00:00.000Z';
  saveAllKeys([
    keyFixture({ id: 'key-old-default', isDefault: true, updatedAt: oldTimestamp }),
    keyFixture({ id: 'key-new-default', isDefault: false, updatedAt: oldTimestamp }),
    keyFixture({ id: 'key-unaffected', isDefault: false, updatedAt: oldTimestamp }),
  ]);
  const result = await request('/api/vault/set-default/key-new-default', { method: 'POST', body: {} });
  assert.equal(result.status, 200);
  const [previous, selected, unaffected] = result.json.keys;
  assert.equal(previous.isDefault, false); assert.equal(selected.isDefault, true);
  assert.notEqual(selected.updatedAt, oldTimestamp); assert.equal(previous.updatedAt, selected.updatedAt);
  assert.equal(unaffected.updatedAt, oldTimestamp);
  assert.deepEqual(getAllKeys().map(item => item.updatedAt), result.json.keys.map(item => item.updatedAt));
  const repeated = await request('/api/vault/set-default/key-new-default', { method: 'POST', body: {} });
  assert.deepEqual(repeated.json.keys.map(item => item.updatedAt), result.json.keys.map(item => item.updatedAt));
});

test('audit search is bounded, literal, case-insensitive, and limited to fixed public metadata', async () => {
  const base = { timestamp: '2026-09-30T00:00:00.000Z', action: 'KEY_CREATED', trigger: 'manual', status: 'success', actor: 'Authenticated operator', details: 'Credential saved.' };
  saveAllSecurityLogs([
    { ...base, id: 'log-1', keyId: 'key-copy', keyLabel: 'Copy Desk', provider: 'openai', metadata: { privateFixture: 'FAKE_HIDDEN_NEEDLE' } },
    { ...base, id: 'log-2', keyId: 'key-photo', keyLabel: 'Photo Desk', provider: 'gemini', details: 'Literal [test].' },
    { ...base, id: 'log-3', action: 'KEY_ROTATED', keyId: 'key-other', provider: 'custom' },
  ]);
  for (const [search, expected] of [['COPY DESK', ['log-1']], ['key-photo', ['log-2']], ['gemini', ['log-2']], ['key_rotated', ['log-3']], ['[test]', ['log-2']]]) {
    const result = await request('/api/vault/audit-logs?search=' + encodeURIComponent(search));
    assert.equal(result.status, 200); assert.deepEqual(result.json.logs.map(item => item.id), expected); assert.equal(result.json.stats.total, expected.length);
  }
  assert.deepEqual((await request('/api/vault/audit-logs?search=FAKE_HIDDEN_NEEDLE')).json.logs, []);
  assert.deepEqual((await request('/api/vault/audit-logs?search=Authenticated')).json.logs, []);
  assert.equal((await request('/api/vault/audit-logs?search=' + 'x'.repeat(201))).status, 400);
  assert.equal((await request('/api/vault/audit-logs?search%5Bx%5D=y')).status, 400);
  assert.equal((await request('/api/vault/audit-logs?limit=1.9')).json.logs.length, 1);
  assert.equal((await request('/api/vault/audit-logs?limit=-5')).json.logs.length, 1);
  assert.equal((await request('/api/vault/audit-logs?limit=Infinity')).json.logs.length, 3);
  assert.equal((await request('/api/vault/audit-logs?limit=999999')).json.logs.length, 3);
});

test('Anthropic execution without a model uses the supported Sonnet 4.6 fallback', async () => {
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Offline draft.' }], usage: { input_tokens: 1, output_tokens: 2 } }));
  };
  const result = await executeLlmPrompt({ provider: 'anthropic', apiKey: secret, inputText: 'Fake newspaper input', systemPrompt: 'Draft a headline.', userPrompt: '', outputFormat: 'text' });
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent.body.model, 'claude-sonnet-4-6');
  assert.equal(sent.options.redirect, 'error');
  assert.equal(result.modelUsed, 'claude-sonnet-4-6');
  assert.equal(result.output, 'Offline draft.');
});
