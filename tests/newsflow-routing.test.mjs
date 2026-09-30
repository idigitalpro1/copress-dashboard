import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const token = 'fictional-newsflow-routing-token-for-offline-tests';

async function serverFixture(extra = {}) {
  const data = await mkdtemp(join(tmpdir(), 'newsflow-route-'));
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const processHandle = spawn(process.execPath, ['scripts/dev-codex.mjs'], {
    cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(port),
      NEWSFLOW_BETA_ENABLED: '1', NEWSFLOW_MCP_TOKEN: token, NEWSFLOW_MASTER_KEY: 'ab'.repeat(32),
      NEWSFLOW_DATA_DIR: data, NEWSFLOW_ALLOW_EXECUTION: '0', ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local SATCOM did not start.')), 15000);
    processHandle.stdout.on('data', chunk => {
      if (chunk.toString().includes('SATCOM preview:')) { clearTimeout(timer); resolve(); }
    });
    processHandle.once('error', error => { clearTimeout(timer); reject(error); });
    processHandle.once('exit', () => { clearTimeout(timer); reject(new Error('Local SATCOM exited before readiness.')); });
  });
  const close = async () => {
    if (processHandle.exitCode === null) {
      processHandle.kill('SIGTERM');
      await once(processHandle, 'exit');
    }
    await rm(data, { recursive: true, force: true });
  };
  try { await ready; } catch (error) { await close(); throw error; }
  return { url: `http://127.0.0.1:${port}`, close };
}

test('one SATCOM listener serves NewsFlow while keeping public MCP and browser vault working', async () => {
  const fixture = await serverFixture();
  const publicClient = new Client({ name: 'satcom-route-test', version: '1' });
  const privateClient = new Client({ name: 'newsflow-route-test', version: '1' });
  try {
    for (const route of ['/apikeys', '/newsflow/', '/api/health']) {
      const response = await fetch(fixture.url + route);
      assert.equal(response.status, 200);
      await response.body.cancel();
    }
    assert.equal((await fetch(fixture.url + '/api/vault/keys')).status, 401);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(fixture.url + '/api/vault/keys', { headers: { ...headers, Origin: 'https://untrusted.invalid' } })).status, 403);
    await publicClient.connect(new StreamableHTTPClientTransport(new URL(fixture.url + '/mcp')));
    assert.deepEqual((await publicClient.listTools()).tools.map(tool => tool.name).sort(),
      ['satcom_board', 'satcom_priorities', 'satcom_prompt', 'satcom_structure']);
    await privateClient.connect(new StreamableHTTPClientTransport(new URL(fixture.url + '/api/newsflow/mcp'), { requestInit: { headers } }));
    assert.deepEqual((await privateClient.listTools()).tools.map(tool => tool.name).sort(),
      ['execute_newspaper_pipeline', 'newsflow_get_prompt', 'newsflow_list_prompts', 'newsflow_vault_status']);
    const rawKey = 'fictional-custom-key-for-routing-verification';
    const saved = await fetch(fixture.url + '/api/vault/validate-and-save', { method: 'POST', headers,
      body: JSON.stringify({ rawKey, providerHint: 'custom', label: 'Offline integration fixture' }) });
    assert.equal(saved.status, 201);
    const savedText = await saved.text();
    assert.ok(!savedText.includes(rawKey));
    assert.equal(JSON.parse(savedText).key.status, 'untested');
    assert.ok(Number.isFinite(Date.parse(JSON.parse(savedText).key.createdAt)));
    const status = await privateClient.callTool({ name: 'newsflow_vault_status', arguments: {} });
    const metadata = JSON.parse(status.content[0].text);
    assert.equal(metadata.total, 1);
    assert.ok(!JSON.stringify(metadata).includes(rawKey));
    assert.equal((await fetch(fixture.url + '/services/mcp-vault/server/crypto.ts')).status, 403);
  } finally {
    await Promise.allSettled([publicClient.close(), privateClient.close()]);
    await fixture.close();
  }
});

test('Vercel cannot silently use temporary disk storage for the private vault', async () => {
  const fixture = await serverFixture({ VERCEL: '1' });
  try {
    const response = await fetch(fixture.url + '/api/vault/keys', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match((await response.json()).error, /persistent/);
    assert.equal((await fetch(fixture.url + '/api/health')).status, 200);
  } finally { await fixture.close(); }
});

test('local dashboard rejects rebound hosts and source files while preserving public assets and secure NewsFlow headers', async () => {
  const fixture = await serverFixture();
  try {
    const hostile = await new Promise((resolve, reject) => {
      const req = http.get(fixture.url + '/newsflow/', { headers: { Host: 'rebound.attacker.invalid' } }, res => {
        res.resume(); res.once('end', () => resolve(res.statusCode));
      });
      req.once('error', reject);
    });
    assert.equal(hostile, 403);
    for (const route of ['/scripts/dev-codex.mjs', '/lib/mcp.js', '/package.json', '/package-lock.json', '/vercel.json', '/api/newsflow.js', '/services/mcp-vault/server/crypto.ts', '/%73cripts/dev-codex.mjs', '/.env']) {
      const response = await fetch(fixture.url + route);
      assert.equal(response.status, 403, route);
      await response.body.cancel();
    }
    assert.equal((await fetch(fixture.url + '/apikeys', { method: 'POST' })).status, 405);
    const page = await fetch(fixture.url + '/newsflow/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    const html = await page.text();
    const asset = /src="([^\"]+\.js)"/.exec(html)?.[1];
    assert.ok(asset, 'the built UI has a script asset');
    const assetResponse = await fetch(fixture.url + asset);
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get('x-content-type-options'), 'nosniff');
    await assetResponse.body.cancel();
    const head = await fetch(fixture.url + '/newsflow/', { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
  } finally { await fixture.close(); }
});
