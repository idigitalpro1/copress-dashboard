import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('private setup saves secrets without printing them and refuses to replace the encryption key', () => {
  const directory = mkdtempSync(join(tmpdir(), 'newsflow-setup-'));
  const script = fileURLToPath(new URL('../scripts/setup-newsflow.mjs', import.meta.url));
  try {
    const first = spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
    assert.equal(first.status, 0);
    const config = join(directory, 'newsflow.env');
    const before = readFileSync(config, 'utf8');
    for (const name of ['NEWSFLOW_MCP_TOKEN', 'NEWSFLOW_MASTER_KEY']) {
      const value = before.match(new RegExp('^' + name + '=([a-f0-9]{64})$', 'm'))?.[1];
      assert.equal(value?.length, 64);
      assert.ok(!first.stdout.includes(value));
      assert.ok(!first.stderr.includes(value));
    }
    assert.equal(statSync(config).mode & 0o777, 0o600);
    assert.match(before, /NEWSFLOW_ALLOW_EXECUTION=0/);
    const second = spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
    assert.equal(second.status, 1);
    assert.equal(readFileSync(config, 'utf8') === before, true);
    assert.match(second.stderr, /preserved/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
