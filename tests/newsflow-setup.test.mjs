import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, rmSync, chmodSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
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

test('setup refuses a shared directory or symlink without changing permissions or writing secrets', () => {
  const directory = mkdtempSync(join(tmpdir(), 'newsflow-shared-'));
  const link = directory + '-link';
  const script = fileURLToPath(new URL('../scripts/setup-newsflow.mjs', import.meta.url));
  try {
    chmodSync(directory, 0o755);
    assert.equal(spawnSync(process.execPath, [script, directory], { encoding: 'utf8' }).status, 1);
    assert.equal(statSync(directory).mode & 0o777, 0o755);
    assert.equal(existsSync(join(directory, 'newsflow.env')), false);
    chmodSync(directory, 0o700); symlinkSync(directory, link);
    assert.equal(spawnSync(process.execPath, [script, link], { encoding: 'utf8' }).status, 1);
    assert.equal(existsSync(join(directory, 'newsflow.env')), false);
  } finally { rmSync(link, { force: true }); rmSync(directory, { recursive: true, force: true }); }
});

test('setup rejects a symlink ancestor into the website before creating a private directory there', () => {
  const directory = mkdtempSync(join(tmpdir(), 'newsflow-setup-alias-'));
  const root = fileURLToPath(new URL('../', import.meta.url));
  const name = basename(directory) + '-private';
  const forbidden = join(root, name);
  try {
    assert.equal(existsSync(forbidden), false);
    const alias = join(directory, 'website'); symlinkSync(root, alias);
    const result = spawnSync(process.execPath, [join(root, 'scripts/setup-newsflow.mjs'), join(alias, name)], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(existsSync(forbidden), false, 'invalid setup did not create anything in the website');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
