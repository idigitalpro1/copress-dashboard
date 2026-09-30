import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import publicMcp from '../api/mcp.js';

const token = 'newsflow-test-bearer-never-a-real-secret-0123456789';
const fakeKey = 'sk-fake-newsflow-test-provider-credential-never-real-0123456789';
const headers = { Authorization: `Bearer ${token}` };
const jsonHeaders = { ...headers, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
const initialization = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
  protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'newsflow-test', version: '1.0.0' },
} };
let server, base, dataDir, mount, mountNewsflowMcp, storage, originalFetch;
let providerResponder;
let providerRequests = [];
const savedEnv = {};
const configuredNames = ['NEWSFLOW_BETA_ENABLED', 'NEWSFLOW_MCP_TOKEN', 'NEWSFLOW_MASTER_KEY', 'NEWSFLOW_DATA_DIR', 'NEWSFLOW_ALLOWED_ORIGINS', 'NEWSFLOW_ALLOW_EXECUTION'];

function listen(httpServer) {
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => { httpServer.off('error', reject); resolve(); });
  });
}

function prompt(id, overrides = {}) {
  return { id, title: `Fake editorial ${id}`, description: 'Synthetic test fixture.', category: 'custom',
    currentVersion: '1.0.0', systemPrompt: `Editorial stage ${id}.`, userTemplate: 'Work on this draft.',
    targetFormat: 'text', recommendedModel: 'gpt-4o-mini', mappedKeyId: 'fake-key-1', temperature: 0.1,
    tags: ['test'], createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', versions: [], ...overrides };
}

before(async () => {
  for (const name of configuredNames) savedEnv[name] = process.env[name];
  dataDir = mkdtempSync(path.join(tmpdir(), 'satcom-newsflow-mcp-test-'));
  Object.assign(process.env, { NEWSFLOW_BETA_ENABLED: '1', NEWSFLOW_MCP_TOKEN: token,
    NEWSFLOW_MASTER_KEY: '42'.repeat(32), NEWSFLOW_DATA_DIR: dataDir,
    NEWSFLOW_ALLOWED_ORIGINS: 'https://editor.test', NEWSFLOW_ALLOW_EXECUTION: '0' });
  ({ mountNewsflowMcp } = await import('../services/mcp-vault/server/mcp.ts'));
  storage = await import('../services/mcp-vault/server/storage.ts');
  const { encryptApiKey } = await import('../services/mcp-vault/server/crypto.ts');
  storage.saveAllKeys([{ id: 'fake-key-1', label: 'Fake test provider', provider: 'openai',
    maskedKey: '••••', encryptedData: encryptApiKey(fakeKey), status: 'active', validationMessage: 'Fixture only',
    isDefault: true, usageCount: 0, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z' }]);
  storage.saveAllPrompts([prompt('fake-normalize'), prompt('fake-headline'), prompt('fake-unmapped', { mappedKeyId: null })]);
  const app = express();
  mount = mountNewsflowMcp(app, { maxLegacySessions: 2, legacySessionTtlMs: 5_000 });
  app.all('/mcp', publicMcp);
  server = createServer(app);
  await listen(server);
  base = `http://127.0.0.1:${server.address().port}`;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin === base || (url.hostname === '127.0.0.1' && url.protocol === 'http:')) return originalFetch(input, init);
    if (url.href === 'https://api.openai.com/v1/chat/completions' && providerResponder) {
      providerRequests.push(JSON.parse(init.body));
      return providerResponder(providerRequests.length);
    }
    throw new Error('Tests prohibit real external provider calls.');
  };
});

after(async () => {
  globalThis.fetch = originalFetch;
  await mount?.close();
  server?.closeAllConnections();
  if (server) await new Promise(resolve => server.close(resolve));
  for (const name of configuredNames) {
    if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name];
  }
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

async function connected(fn, { legacy = false, publicEndpoint = false } = {}) {
  const client = new Client({ name: 'newsflow-test', version: '1.0.0' });
  const transport = legacy
    ? new SSEClientTransport(new URL(base + '/sse'), { requestInit: { headers } })
    : new StreamableHTTPClientTransport(new URL(base + (publicEndpoint ? '/mcp' : '/api/newsflow/mcp')), {
      requestInit: { headers: publicEndpoint ? {} : headers },
    });
  try { await client.connect(transport); return await fn(client); }
  finally { await client.close(); }
}

async function rawSse(url = base + '/sse', requestHeaders = headers) {
  const controller = new AbortController();
  const response = await fetch(url, { headers: requestHeaders, signal: controller.signal });
  if (response.status !== 200) return { response, close() { controller.abort(); } };
  const reader = response.body.getReader();
  const first = await reader.read();
  const text = new TextDecoder().decode(first.value);
  const endpoint = /data: (\S+)/.exec(text)?.[1];
  assert.ok(endpoint?.startsWith('/message?sessionId='));
  return { response, endpoint, async close() { controller.abort(); await reader.cancel().catch(() => {}); } };
}

async function fixture(options, fn, preparse = false) {
  const app = express();
  if (preparse) app.use(express.json({ limit: '512kb' }));
  const mounted = mountNewsflowMcp(app, options);
  const httpServer = createServer(app);
  await listen(httpServer);
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  try { return await fn(url); }
  finally { await mounted.close(); httpServer.closeAllConnections(); await new Promise(resolve => httpServer.close(resolve)); }
}

function rawRequest(url, { method = 'POST', headers: requestHeaders = jsonHeaders, body = JSON.stringify(initialization) } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method, headers: requestHeaders }, response => {
      let text = '';
      response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

test('DNS rebinding authorities and duplicate security headers are rejected before stream allocation', async () => {
  const port = new URL(base).port;
  for (const host of ['rebound.invalid:' + port, 'localhost.evil:' + port, '127.1:' + port, 'localhost.:' + port, 'localhost:1', 'user@localhost:' + port]) {
    const response = await rawRequest(base + '/sse', { method: 'GET', headers: { ...headers, Host: host, Accept: 'text/event-stream' }, body: '' });
    assert.equal(response.status, 403, host);
  }
  const duplicateAuth = await rawRequest(base + '/api/newsflow/mcp', { headers: [
    'Host', '127.0.0.1:' + port, 'Authorization', `Bearer ${token}`, 'Authorization', `Bearer ${token}`,
    'Content-Type', 'application/json', 'Accept', 'application/json, text/event-stream',
  ] });
  assert.equal(duplicateAuth.status, 400);
  const duplicateHost = await rawRequest(base + '/sse', { method: 'GET', headers: [
    'Host', '127.0.0.1:' + port, 'Host', 'rebound.invalid:' + port,
    'Authorization', `Bearer ${token}`, 'Accept', 'text/event-stream',
  ], body: '' });
  assert.ok([400, 403].includes(duplicateHost.status));
  const trusted = await rawSse(base + '/sse', { ...headers, Host: 'localhost:' + port });
  assert.equal(trusted.response.status, 200);
  await trusted.close();
});

test('bounded failed-auth budgets ignore forwarding headers and never lock out valid credentials', async () => {
  const { createNewsflowRequestAuthorizer } = await import('../services/mcp-vault/server/http-security.ts');
  const authorize = createNewsflowRequestAuthorizer({ maxFailuresPerAddress: 1, maxFailuresTotal: 3, maxTrackedAddresses: 1 });
  const mock = (authorization, address, forwarded = '') => ({ headers: { authorization, host: 'localhost:4321', 'x-forwarded-for': forwarded },
    rawHeaders: ['Authorization', authorization, 'Host', 'localhost:4321'], socket: { localPort: 4321, remoteAddress: address } });
  assert.throws(() => authorize(mock('Bearer invalid', '127.0.0.1', 'fake1')), error => error.statusCode === 401);
  assert.throws(() => authorize(mock('Bearer invalid', '127.0.0.1', 'fake2')), error => error.statusCode === 429 && error.retryAfterSeconds > 0);
  assert.throws(() => authorize(mock('Bearer invalid', 'different-peer')), error => error.statusCode === 401);
  assert.throws(() => authorize(mock('Bearer invalid', 'third-peer')), error => error.statusCode === 429);
  const valid = mock(`Bearer ${token}`, '127.0.0.1');
  const authorized = authorize(valid);
  assert.equal(authorized.bearerDigest.length, 32);
  assert.equal(authorize(valid), authorized, 'REST and MCP reuse the same successful request authorization');
});

test('MCP accepts UTF-8 JSON and rejects compression, unsupported media parameters and disabled Accept ranges', async () => {
  for (const extra of [
    { 'Content-Type': 'application/json; charset=iso-8859-1' },
    { 'Content-Type': 'application/json; charset=utf-16' },
    { 'Content-Type': 'application/json; unknown=true' },
    { 'Content-Encoding': 'gzip' }, { 'Content-Encoding': 'br' },
  ]) {
    const response = await fetch(base + '/api/newsflow/mcp', { method: 'POST', headers: { ...jsonHeaders, ...extra }, body: JSON.stringify(initialization) });
    assert.equal(response.status, 415);
  }
  const valid = await fetch(base + '/api/newsflow/mcp', { method: 'POST', headers: { ...jsonHeaders, 'Content-Type': 'application/json; charset="UTF-8"' }, body: JSON.stringify(initialization) });
  assert.equal(valid.status, 200);
  for (const accept of ['application/json', 'application/json;q=0, text/event-stream', 'application/json, text/event-stream;q=0']) {
    assert.equal((await fetch(base + '/api/newsflow/mcp', { method: 'POST', headers: { ...jsonHeaders, Accept: accept }, body: JSON.stringify(initialization) })).status, 406);
  }
  assert.equal((await fetch(base + '/sse', { headers: { ...headers, Accept: 'application/json' } })).status, 406);
});

test('JSON limits cover chunked and pre-parsed requests, deep/numerous nodes and prototype-shaped data', async () => {
  let nested = {};
  for (let depth = 0; depth < 30; depth++) nested = { child: nested };
  const bodies = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { nested } }),
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { nodes: Array(10001).fill(0) } }),
    '{"jsonrpc":"2.0","id":1,"method":"ping","params":{"__proto__":{"private":"fake-marker"}}}',
    JSON.stringify({ jsonrpc: '2.0', id: 'x'.repeat(129), method: 'ping' }),
  ];
  for (const body of bodies) {
    const response = await rawRequest(base + '/api/newsflow/mcp', { body });
    assert.equal(response.status, 400);
    assert.ok(!response.text.includes('fake-marker'));
  }
  const large = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { ignored: 'x'.repeat(270000) } });
  assert.equal((await rawRequest(base + '/api/newsflow/mcp', { body: large })).status, 413);
  await fixture({}, async url => {
    assert.equal((await rawRequest(url + '/api/newsflow/mcp', { body: large })).status, 413);
  }, true);
});

test('authenticated MCP request budgets reset and reject excess work without allocating a session', () => fixture({ maxRequestsPerWindow: 2, requestWindowMs: 40 }, async url => {
  for (let index = 0; index < 2; index++) assert.equal((await rawRequest(url + '/api/newsflow/mcp')).status, 200);
  const limited = await rawRequest(url + '/api/newsflow/mcp');
  assert.equal(limited.status, 429); assert.equal(limited.headers['retry-after'], '1');
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal((await rawRequest(url + '/api/newsflow/mcp')).status, 200);
}));

test('a stalled upload cannot hold all MCP request slots indefinitely', () => fixture({ maxConcurrentRequests: 1, bodyReadTimeoutMs: 80 }, async url => {
  let upload;
  const timedOut = new Promise((resolve, reject) => {
    upload = httpRequest(url + '/api/newsflow/mcp', { method: 'POST', headers: jsonHeaders }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    upload.on('error', reject);
    upload.write('{"jsonrpc":"2.0"');
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await rawRequest(url + '/api/newsflow/mcp')).status, 429);
  assert.equal(await timedOut, 408);
  upload.destroy();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await rawRequest(url + '/api/newsflow/mcp')).status, 200);
}));

test('legacy absolute lifetime expires even when valid messages keep the stream active', () => fixture({ legacySessionTtlMs: 100, legacySessionMaxAgeMs: 120 }, async url => {
  const stream = await rawSse(url + '/sse');
  try {
    assert.equal((await rawRequest(url + stream.endpoint)).status, 202);
    for (let index = 0; index < 3; index++) {
      await new Promise(resolve => setTimeout(resolve, 25));
      assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) })).status, 202);
    }
    await new Promise(resolve => setTimeout(resolve, 70));
    assert.equal((await rawRequest(url + stream.endpoint)).status, 404);
  } finally { await stream.close(); }
}));

test('legacy outstanding request limits reject concurrent and duplicate IDs then release the slot', async () => {
  process.env.NEWSFLOW_ALLOW_EXECUTION = '1';
  let finishProvider;
  let startedProvider;
  const started = new Promise(resolve => { startedProvider = resolve; });
  providerResponder = () => { startedProvider(); return new Promise(resolve => { finishProvider = resolve; }); };
  providerRequests = [];
  try {
    await fixture({ maxPendingLegacyRequests: 1 }, async url => {
      const stream = await rawSse(url + '/sse');
      try {
        assert.equal((await rawRequest(url + stream.endpoint)).status, 202);
        const call = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'execute_newspaper_pipeline', arguments: { promptIds: ['fake-normalize'], inputText: 'Synthetic OCR.' } } };
        assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify(call) })).status, 202);
        await started;
        assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify(call) })).status, 409);
        assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' }) })).status, 429);
        finishProvider(new Response(JSON.stringify({ choices: [{ message: { content: 'Synthetic draft.' } }] }), { status: 200 }));
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'ping' }) })).status, 202);
        assert.equal(providerRequests.length, 1);
      } finally { finishProvider?.(new Response('{}')); await stream.close(); }
    });
  } finally { providerResponder = undefined; process.env.NEWSFLOW_ALLOW_EXECUTION = '0'; }
});

test('legacy cancellations are validated, keep in-flight IDs reserved and prevent later provider stages', async () => {
  process.env.NEWSFLOW_ALLOW_EXECUTION = '1';
  let finishProvider;
  let providerStarted;
  const started = new Promise(resolve => { providerStarted = resolve; });
  providerResponder = () => { providerStarted(); return new Promise(resolve => { finishProvider = resolve; }); };
  providerRequests = [];
  try {
    await fixture({ maxPendingLegacyRequests: 1 }, async url => {
      const stream = await rawSse(url + '/sse');
      try {
        assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify({ ...initialization, id: 0 }) })).status, 202);
        const call = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'execute_newspaper_pipeline', arguments: { promptIds: ['fake-normalize', 'fake-headline'], inputText: 'Synthetic OCR.' } } };
        for (const id of [0, '']) {
          assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify({ ...call, id }) })).status, 400);
        }
        assert.equal(providerRequests.length, 0);
        assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify(call) })).status, 202);
        await started;
        const cancel = requestId => ({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId } });
        assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify({ ...cancel(2), params: { requestId: 2, reason: 42 } }) })).status, 400);
        for (const requestId of [0, 99, '2']) {
          assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify(cancel(requestId)) })).status, 202);
          assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' }) })).status, 429);
        }
        assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 2 } }) })).status, 202);
        assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify(call) })).status, 409);
        assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' }) })).status, 429);
        finishProvider(new Response(JSON.stringify({ choices: [{ message: { content: 'Synthetic draft.' } }] }), { status: 200 }));
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.equal(providerRequests.length, 1);
        assert.equal((await rawRequest(url + stream.endpoint, { body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' }) })).status, 202);
      } finally { finishProvider?.(new Response('{}')); await stream.close(); }
    });
  } finally { providerResponder = undefined; process.env.NEWSFLOW_ALLOW_EXECUTION = '0'; }
});

test('SDK stateless handshake exposes exactly four scoped tools and safe annotations', () => connected(async client => {
  assert.equal(client.getServerVersion().name, 'newsflow-vault');
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), [
    'execute_newspaper_pipeline', 'newsflow_get_prompt', 'newsflow_list_prompts', 'newsflow_vault_status',
  ]);
  for (const tool of tools) {
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.annotations.readOnlyHint, tool.name !== 'execute_newspaper_pipeline');
    assert.equal(tool.annotations.openWorldHint, tool.name === 'execute_newspaper_pipeline');
  }
}));

test('vault metadata is fully masked and prompt tools read saved fake content', () => connected(async client => {
  const status = await client.callTool({ name: 'newsflow_vault_status', arguments: {} });
  assert.equal(status.structuredContent.total, 1);
  assert.equal(status.structuredContent.keys[0].maskedKey, '••••••••••••');
  assert.equal(status.structuredContent.executionEnabled, false);
  const serialized = JSON.stringify(status);
  assert.ok(!serialized.includes(fakeKey));
  assert.ok(!serialized.includes('encryptedData'));
  assert.ok(!serialized.includes(storage.getAllKeys()[0].encryptedData));
  const list = await client.callTool({ name: 'newsflow_list_prompts', arguments: { limit: 1, offset: 1 } });
  assert.equal(list.structuredContent.total, 3);
  assert.equal(list.structuredContent.prompts[0].id, 'fake-headline');
  assert.ok(!JSON.stringify(list).includes('Editorial stage'));
  const read = await client.callTool({ name: 'newsflow_get_prompt', arguments: { promptId: 'fake-normalize' } });
  assert.equal(read.structuredContent.prompt.systemPrompt, 'Editorial stage fake-normalize.');
  assert.equal((await client.callTool({ name: 'newsflow_get_prompt', arguments: { promptId: '../../.env' } })).isError, true);
}));

test('bearer authentication precedes method/body responses and origin checks', async () => {
  for (const endpoint of ['/api/newsflow/mcp', '/sse', '/message']) {
    assert.equal((await fetch(base + endpoint)).status, 401);
    assert.equal((await fetch(base + endpoint, { method: 'POST', headers: { Authorization: 'Bearer wrong', 'Content-Type': 'application/json' }, body: '{' })).status, 401);
    assert.equal((await fetch(base + endpoint, { headers: { ...headers, Origin: 'https://foreign.test' } })).status, 403);
  }
  for (const origin of ['http://localhost:4321', 'http://127.0.0.1:4321', 'https://editor.test']) {
    const response = await fetch(base + '/api/newsflow/mcp', { method: 'POST', headers: { ...jsonHeaders, Origin: origin }, body: JSON.stringify(initialization) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('mcp-session-id'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await fetch(base + '/api/newsflow/mcp', { headers: { ...headers, Origin: 'https://editor.test.evil' } })).status, 403);
});

test('missing beta configuration fails closed and creates no legacy stream', async () => {
  const original = process.env.NEWSFLOW_BETA_ENABLED;
  process.env.NEWSFLOW_BETA_ENABLED = '0';
  try {
    for (const endpoint of ['/api/newsflow/mcp', '/sse', '/message']) assert.equal((await fetch(base + endpoint, { headers })).status, 503);
  } finally { process.env.NEWSFLOW_BETA_ENABLED = original; }
  process.env.NEWSFLOW_MCP_TOKEN = 'too-short';
  try { assert.equal((await fetch(base + '/sse', { headers })).status, 503); }
  finally { process.env.NEWSFLOW_MCP_TOKEN = token; }
});

test('authenticated stateless GET returns 405; malformed messages never echo input', async () => {
  const get = await fetch(base + '/api/newsflow/mcp', { headers });
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  assert.equal((await fetch(base + '/api/newsflow/mcp', { method: 'POST', headers, body: '{}' })).status, 415);
  for (const body of ['{"secret":"private-test-marker"', '{"jsonrpc":"2.0","private":"private-test-marker"}']) {
    const response = await fetch(base + '/api/newsflow/mcp', { method: 'POST', headers: jsonHeaders, body });
    assert.equal(response.status, 400);
    assert.ok(!(await response.text()).includes('private-test-marker'));
  }
});

test('disabled execution returns a safe tool error without contacting a provider', () => connected(async client => {
  providerRequests = [];
  const response = await client.callTool({ name: 'execute_newspaper_pipeline', arguments: { promptIds: ['fake-normalize'], inputText: 'Synthetic newspaper draft.' } });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /disabled/);
  assert.equal(providerRequests.length, 0);
}));

test('pipeline bounds and every selected prompt/key are validated before provider calls', async () => {
  process.env.NEWSFLOW_ALLOW_EXECUTION = '1';
  providerRequests = [];
  try {
    await connected(async client => {
      for (const args of [
        { promptIds: ['fake-normalize', 'fake-normalize'], inputText: 'Draft' },
        { promptIds: ['fake-normalize', 'missing'], inputText: 'Draft' },
        { promptIds: ['fake-normalize', 'fake-unmapped'], inputText: 'Draft' },
        { promptIds: ['fake-normalize', 'fake-headline', 'fake-unmapped', 'fourth'], inputText: 'Draft' },
        { promptIds: ['fake-normalize'], inputText: 'x'.repeat(100001) },
      ]) assert.equal((await client.callTool({ name: 'execute_newspaper_pipeline', arguments: args })).isError, true);
      assert.equal(providerRequests.length, 0);
    });
  } finally { process.env.NEWSFLOW_ALLOW_EXECUTION = '0'; }
});

test('enabled pipeline calls only the mocked provider sequentially and returns drafts', async () => {
  process.env.NEWSFLOW_ALLOW_EXECUTION = '1';
  providerRequests = [];
  providerResponder = stage => new Response(JSON.stringify({ choices: [{ message: { content: `Synthetic draft stage ${stage}` } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    await connected(async client => {
      const response = await client.callTool({ name: 'execute_newspaper_pipeline', arguments: { promptIds: ['fake-normalize', 'fake-headline'], inputText: 'Original synthetic OCR.', temperature: 0.3 } });
      assert.equal(response.isError, undefined);
      assert.equal(response.structuredContent.draftOnly, true);
      assert.equal(response.structuredContent.stages.length, 2);
      assert.equal(response.structuredContent.finalOutput, 'Synthetic draft stage 2');
      assert.match(providerRequests[0].messages[1].content, /Original synthetic OCR/);
      assert.match(providerRequests[1].messages[1].content, /Synthetic draft stage 1/);
      assert.equal(providerRequests[1].temperature, 0.3);
      assert.ok(!JSON.stringify(response).includes(fakeKey));
    });
  } finally { process.env.NEWSFLOW_ALLOW_EXECUTION = '0'; providerResponder = undefined; }
});

test('a model override incompatible with a later provider makes no provider call', async () => {
  const originalKeys = storage.getAllKeys();
  const originalPrompts = storage.getAllPrompts();
  storage.saveAllKeys([...originalKeys, { ...originalKeys[0], id: 'fake-gemini-key', provider: 'gemini' }]);
  storage.saveAllPrompts([...originalPrompts, prompt('fake-gemini-stage', { mappedKeyId: 'fake-gemini-key', recommendedModel: 'gemini-3.5-flash' })]);
  process.env.NEWSFLOW_ALLOW_EXECUTION = '1';
  providerRequests = [];
  try {
    await connected(async client => {
      const response = await client.callTool({ name: 'execute_newspaper_pipeline', arguments: {
        promptIds: ['fake-normalize', 'fake-gemini-stage'], inputText: 'Synthetic OCR.', model: 'gpt-4o-mini',
      } });
      assert.equal(response.isError, true);
      assert.match(response.content[0].text, /compatible/);
      assert.equal(providerRequests.length, 0);
    });
  } finally {
    storage.saveAllKeys(originalKeys); storage.saveAllPrompts(originalPrompts);
    process.env.NEWSFLOW_ALLOW_EXECUTION = '0';
  }
});

test('an oversized intermediate draft stops before the next provider request', async () => {
  process.env.NEWSFLOW_ALLOW_EXECUTION = '1';
  providerRequests = [];
  providerResponder = () => new Response(JSON.stringify({ choices: [{ message: { content: 'x'.repeat(100001) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    await connected(async client => {
      const response = await client.callTool({ name: 'execute_newspaper_pipeline', arguments: { promptIds: ['fake-normalize', 'fake-headline'], inputText: 'Synthetic OCR.' } });
      assert.equal(response.isError, true);
      assert.match(response.content[0].text, /intermediate draft/);
      assert.equal(providerRequests.length, 1);
    });
  } finally { process.env.NEWSFLOW_ALLOW_EXECUTION = '0'; providerResponder = undefined; }
});

test('provider failures are safe errors without echoed credentials or draft input', async () => {
  process.env.NEWSFLOW_ALLOW_EXECUTION = '1';
  providerRequests = [];
  providerResponder = () => new Response(JSON.stringify({ error: { message: `${fakeKey} private-draft-marker` } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  try {
    await connected(async client => {
      const response = await client.callTool({ name: 'execute_newspaper_pipeline', arguments: { promptIds: ['fake-normalize', 'fake-headline'], inputText: 'private-draft-marker' } });
      assert.equal(response.isError, true);
      assert.ok(!JSON.stringify(response).includes(fakeKey));
      assert.ok(!JSON.stringify(response).includes('private-draft-marker'));
      assert.equal(providerRequests.length, 1);
    });
  } finally { process.env.NEWSFLOW_ALLOW_EXECUTION = '0'; providerResponder = undefined; }
});

test('legacy SDK initializes and reads fake prompt under the same bearer', () => connected(async client => {
  assert.equal((await client.listTools()).tools.length, 4);
  const response = await client.callTool({ name: 'newsflow_get_prompt', arguments: { promptId: 'fake-headline' } });
  assert.equal(response.structuredContent.prompt.id, 'fake-headline');
}, { legacy: true }));

test('legacy messages require an authenticated, existing session bound to bearer and origin', async () => {
  const stream = await rawSse();
  try {
    assert.equal((await fetch(base + stream.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(initialization) })).status, 401);
    assert.equal((await fetch(base + '/message?sessionId=unknown', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(initialization) })).status, 404);
    assert.equal((await fetch(base + stream.endpoint, { method: 'POST', headers: { ...jsonHeaders, Origin: 'https://editor.test' }, body: JSON.stringify(initialization) })).status, 403);
    const rotated = 'rotated-fake-newsflow-bearer-token-abcdefghijklmnopqrstuvwxyz';
    process.env.NEWSFLOW_MCP_TOKEN = rotated;
    try {
      assert.equal((await fetch(base + stream.endpoint, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(initialization) })).status, 401);
      assert.equal((await fetch(base + stream.endpoint, { method: 'POST', headers: { ...jsonHeaders, Authorization: `Bearer ${rotated}` }, body: JSON.stringify(initialization) })).status, 403);
    } finally { process.env.NEWSFLOW_MCP_TOKEN = token; }
    const invalid = await fetch(base + stream.endpoint, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ private: 'private-test-marker' }) });
    assert.equal(invalid.status, 400);
    assert.ok(!(await invalid.text()).includes('private-test-marker'));
    assert.equal((await fetch(base + stream.endpoint, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(initialization) })).status, 202);
  } finally { await stream.close(); }
});

test('legacy session capacity is bounded and closing a stream frees its slot', async () => {
  await new Promise(resolve => setTimeout(resolve, 20));
  const head = await fetch(base + '/sse', { method: 'HEAD', headers, signal: AbortSignal.timeout(1000) });
  assert.equal(head.status, 405);
  assert.equal(head.headers.get('allow'), 'GET');
  const first = await rawSse();
  const second = await rawSse();
  try {
    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
    const overflow = await rawSse();
    assert.equal(overflow.response.status, 429);
    await overflow.close();
    await first.close();
    await new Promise(resolve => setTimeout(resolve, 20));
    const replacement = await rawSse();
    assert.equal(replacement.response.status, 200);
    await replacement.close();
    assert.equal((await fetch(base + first.endpoint, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(initialization) })).status, 404);
  } finally { await first.close(); await second.close(); }
});

test('legacy idle expiry closes the stream and rejects its old session', async () => {
  const app = express();
  const shortMount = mountNewsflowMcp(app, { maxLegacySessions: 1, legacySessionTtlMs: 40 });
  const shortServer = createServer(app);
  await listen(shortServer);
  const shortBase = `http://127.0.0.1:${shortServer.address().port}`;
  const stream = await rawSse(shortBase + '/sse');
  try {
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal((await fetch(shortBase + stream.endpoint, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(initialization) })).status, 404);
    const replacement = await rawSse(shortBase + '/sse');
    assert.equal(replacement.response.status, 200);
    await replacement.close();
  } finally {
    await stream.close();
    await shortMount.close();
    shortServer.closeAllConnections();
    await new Promise(resolve => shortServer.close(resolve));
  }
});

test('SATCOM public MCP still has only its four read-only tools without NewsFlow auth', () => connected(async client => {
  const { tools } = await client.listTools();
  assert.equal(client.getServerVersion().name, 'satcom-operations');
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['satcom_board', 'satcom_priorities', 'satcom_prompt', 'satcom_structure']);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint === true));
  assert.ok(tools.every(tool => tool.name !== 'execute_newspaper_pipeline'));
}, { publicEndpoint: true }));
