import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvFile, planEnvImport } from '../js/vault-env.mjs';

const fake = 'FICTIONAL_CREDENTIAL_0123456789';
const timestamp = '2026-09-30T12:34:56.000Z';

function credential(line) {
  const parsed = parseEnvFile(line);
  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.entries.length, 1);
  return parsed.entries[0].credential;
}

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
}

function service(id, key, value, savedAt) {
  return {
    id, name: id, cat: 'ai', fields: [{ key, label: 'API key' }],
    values: value === undefined ? {} : { [key]: value },
    ...(savedAt ? { savedAt } : {}),
  };
}

function idFactory() {
  let count = 0;
  return () => 'import-test-' + (++count);
}

test('BOM, CRLF, comments, export and quoted values retain accurate line numbers', () => {
  const value = 'opaque-fake-key#fragment==/+tail';
  const parsed = parseEnvFile('\uFEFF# Comment\r\n\r\nexport XAI_API_KEY="' + value + '" # trailing\r\n');
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.skipped, 0);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].line, 3);
  assert.equal(parsed.entries[0].sourceKey, 'XAI_API_KEY');
  assert.equal(parsed.entries[0].credential.value, value);
  assert.equal(parsed.entries[0].credential.envKey, 'XAI_API_KEY');
});

test('literal credential bytes survive single quotes, double quotes and bare values', () => {
  const value = 'opaque-fake#embedded==/+with\\literal\\n';
  const text = [
    `FIRST_API_KEY=${value} # ignored`,
    `SECOND_API_KEY='${value}'`,
    `THIRD_API_KEY="${value}"`,
    'HASH_API_KEY="#leading-hash-fake-key"',
  ].join('\n');
  const parsed = parseEnvFile(text);
  assert.deepEqual(parsed.issues, []);
  assert.deepEqual(parsed.entries.map(entry => entry.credential.value), [value, value, value, '#leading-hash-fake-key']);
});

test('configuration variables and empty credentials are skipped without discarding valid keys', () => {
  const parsed = parseEnvFile([
    'PORT=4321',
    'ENABLED=true',
    'DATABASE_URL=https://example.invalid',
    'API_BASE_URL=https://example.invalid/v1',
    'EMPTY_KEY=',
    'EMPTY_SECRET=""',
    'EMPTY_TOKEN= # empty with comment',
    `VALID_PASSWORD=${fake}`,
  ].join('\n'));
  assert.equal(parsed.skipped, 7);
  assert.deepEqual(parsed.issues, []);
  assert.deepEqual(parsed.entries.map(entry => entry.sourceKey), ['VALID_PASSWORD']);
});

test('aliases use canonical metadata while source names and uncertain providers remain explicit', () => {
  const parsed = parseEnvFile([
    'GEMINI_API_KEY=AIza00000000000000000000000000000000000',
    `STRIPE_PUBLISHABLE_KEY=pk_test_${fake}`,
    `PRIVATE_VENDOR_TOKEN=xai-${fake}`,
    `OPENAI_API_KEY=xai-${fake}`,
    'GOOGLE_API_KEY=AIza11111111111111111111111111111111111',
  ].join('\n'));
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.entries[0].sourceKey, 'GEMINI_API_KEY');
  assert.equal(parsed.entries[0].credential.envKey, 'GOOGLE_AGENT_API_KEY');
  assert.equal(parsed.entries[0].credential.ambiguous, false);
  assert.equal(parsed.entries[1].credential.envKey, 'STRIPE_PUB_KEY');
  assert.equal(parsed.entries[1].credential.ambiguous, false);
  assert.equal(parsed.entries[2].credential.envKey, 'PRIVATE_VENDOR_TOKEN');
  assert.equal(parsed.entries[2].credential.name, 'Imported API key');
  assert.equal(parsed.entries[2].credential.ambiguous, true);
  assert.equal(parsed.entries[3].credential.envKey, 'OPENAI_API_KEY');
  assert.equal(parsed.entries[3].credential.ambiguous, true);
  assert.equal(parsed.entries[4].credential.ambiguous, true);
});

test('all occurrences of a duplicate source name are excluded, including an empty replacement', () => {
  const parsed = parseEnvFile([
    `XAI_API_KEY=xai-${fake}`,
    `OPENAI_API_KEY=sk-proj-${fake}`,
    'XAI_API_KEY=',
    `XAI_API_KEY=xai-${fake}-other`,
  ].join('\n'));
  assert.deepEqual(parsed.entries.map(entry => entry.sourceKey), ['OPENAI_API_KEY']);
  assert.deepEqual(parsed.issues.map(issue => issue.line), [3, 4]);
  for (const issue of parsed.issues) assert.match(issue.message, /duplicate/i);
});

test('different source aliases are not silently collapsed during review', () => {
  const parsed = parseEnvFile(`GEMINI_API_KEY=${fake}\nGOOGLE_AGENT_API_KEY=${fake}-other`);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].credential.envKey, parsed.entries[1].credential.envKey);
});

test('malformed assignments, unsafe names and unsupported names produce redacted issues', () => {
  const parsed = parseEnvFile([
    `BAD-NAME_KEY=${fake}`,
    `__proto__=${fake}`,
    `constructor=${fake}`,
    `prototype=${fake}`,
    `lowercase_api_key=${fake}`,
    `OTHER_KEY="${fake}" trailing-data`,
    `VALID_TOKEN=${fake}`,
  ].join('\n'));
  assert.deepEqual(parsed.entries.map(entry => entry.sourceKey), ['VALID_TOKEN']);
  assert.deepEqual(parsed.issues.map(issue => issue.line), [1, 2, 3, 4, 5, 6]);
  const messages = parsed.issues.map(issue => issue.message).join('\n');
  for (const sensitive of [fake, 'BAD-NAME', '__proto__', 'constructor', 'prototype', 'lowercase_api_key', 'trailing-data']) {
    assert.ok(!messages.includes(sensitive), 'Issue messages must not reflect input');
  }
});

test('multiline quotes never turn their contents into imported assignments', () => {
  const parsed = parseEnvFile([
    `MULTILINE_KEY="${fake}`,
    `OPENAI_API_KEY=sk-proj-${fake}`,
    '"',
    `VALID_TOKEN=${fake}`,
  ].join('\n'));
  assert.deepEqual(parsed.entries.map(entry => entry.sourceKey), ['VALID_TOKEN']);
  assert.deepEqual(parsed.issues.map(issue => issue.line), [1]);
  assert.match(parsed.issues[0].message, /multiline|unclosed/i);
});

test('multiline configuration values also cannot inject credential assignments', () => {
  const parsed = parseEnvFile(`CONFIG="first\nOPENAI_API_KEY=${fake}\nlast"\nVALID_TOKEN=${fake}`);
  assert.deepEqual(parsed.entries.map(entry => entry.sourceKey), ['VALID_TOKEN']);
  assert.equal(parsed.issues.length, 1);
});

test('rejected backslash continuations cannot expose following lines as separate credentials', () => {
  const parsed = parseEnvFile([
    'CONFIG=continued-value\\',
    `OPENAI_API_KEY=${fake}\\`,
    `XAI_API_KEY=${fake}`,
    `VALID_TOKEN=${fake}`,
  ].join('\n'));
  assert.deepEqual(parsed.entries.map(entry => entry.sourceKey), ['VALID_TOKEN']);
  assert.deepEqual(parsed.issues.map(issue => issue.line), [1]);
  assert.match(parsed.issues[0].message, /continuation/i);
});

test('interpolation, command syntax, control characters and continuations are rejected literally', async t => {
  const values = [
    '${PRIVATE_TOKEN}', '$PRIVATE_TOKEN', '$(fictional_command)',
    '`fictional_command`', `${fake};fictional_command`, `${fake}|fictional_command`,
    `${fake}&&fictional_command`, 'eval(fictional_command)', `${fake}\\`,
    `${fake}\u0000suffix`, `${fake}\u007fsuffix`,
  ];
  for (let index = 0; index < values.length; index++) {
    await t.test('unsupported syntax ' + (index + 1), () => {
      const parsed = parseEnvFile('EXAMPLE_KEY=' + values[index]);
      assert.equal(parsed.entries.length, 0);
      assert.equal(parsed.issues.length, 1);
      assert.equal(parsed.issues[0].line, 1);
      assert.ok(!parsed.issues[0].message.includes(values[index]));
    });
  }
});

test('file size limit counts UTF-8 bytes and accepts the exact maximum', () => {
  const exact = parseEnvFile('#' + 'a'.repeat(256 * 1024 - 1));
  assert.deepEqual(exact.issues, []);
  const largeAscii = parseEnvFile('#' + 'a'.repeat(256 * 1024));
  const largeUnicode = parseEnvFile('#' + 'é'.repeat(128 * 1024));
  for (const parsed of [largeAscii, largeUnicode]) {
    assert.equal(parsed.entries.length, 0);
    assert.equal(parsed.issues.length, 1);
    assert.equal(parsed.issues[0].line, 0);
    assert.match(parsed.issues[0].message, /256 KiB/);
  }
});

test('review is capped at 200 credentials and reports where the limit was reached', () => {
  const text = Array.from({ length: 205 }, (_, index) => `SERVICE_${index}_API_KEY=${fake}-${index}`).join('\n');
  const parsed = parseEnvFile(text);
  assert.equal(parsed.entries.length, 200);
  assert.equal(parsed.issues.length, 1);
  assert.equal(parsed.issues[0].line, 201);
  assert.match(parsed.issues[0].message, /200/);
});

test('diagnostics stay bounded even for a maximum-size file of malformed lines', () => {
  const exactLimit = parseEnvFile('x\n'.repeat(100));
  assert.equal(exactLimit.issues.length, 100);
  assert.ok(exactLimit.issues.every(issue => !issue.message.includes('omitted')));

  const parsed = parseEnvFile('x\n'.repeat(128 * 1024));
  assert.deepEqual(parsed.entries, []);
  assert.equal(parsed.issues.length, 101);
  assert.deepEqual(parsed.issues.slice(0, 100).map(issue => issue.line), Array.from({ length: 100 }, (_, index) => index + 1));
  assert.equal(parsed.issues[100].line, 101);
  assert.equal(parsed.issues[100].message, 'Additional issues omitted. Review a smaller file to see the remaining issues.');
});

test('reaching the diagnostic limit never bypasses later duplicate exclusion or valid rows', () => {
  const parsed = parseEnvFile([
    `XAI_API_KEY=xai-${fake}`,
    ...Array(200).fill('malformed'),
    `XAI_API_KEY=xai-${fake}-replacement`,
    `VALID_TOKEN=${fake}`,
  ].join('\n'));
  assert.equal(parsed.issues.length, 101);
  assert.match(parsed.issues.at(-1).message, /additional issues omitted/i);
  assert.deepEqual(parsed.entries.map(entry => entry.sourceKey), ['VALID_TOKEN']);
  assert.equal(parsed.entries[0].line, 203);
});

test('nontext and empty files return review results without throwing', () => {
  assert.deepEqual(parseEnvFile(''), { entries: [], skipped: 0, issues: [] });
  for (const value of [null, undefined, 123, {}]) {
    const parsed = parseEnvFile(value);
    assert.equal(parsed.entries.length, 0);
    assert.equal(parsed.issues[0].line, 0);
  }
});

test('batch planning preserves existing values, deduplicates, and stamps every changed card once', () => {
  const existing = 'xai-existing-fictional-key';
  const before = deepFreeze([
    service('xai-grok', 'XAI_API_KEY', existing, '2026-09-01T00:00:00.000Z'),
    service('openai', 'OPENAI_API_KEY'),
  ]);
  const openai = credential(`OPENAI_API_KEY=sk-proj-${fake}`);
  const additional = credential(`XAI_API_KEY=xai-${fake}`);
  const selected = [credential(`XAI_API_KEY=${existing}`), openai, additional, additional];
  const plan = planEnvImport(before, selected, idFactory(), timestamp);
  assert.equal(plan.imported, 2);
  assert.equal(plan.duplicates, 2);
  assert.equal(plan.savedAt, timestamp);
  assert.equal(plan.apis.length, 3);
  assert.equal(new Set(plan.ids).size, plan.ids.length);
  assert.equal(plan.apis[0], before[0]);
  assert.equal(plan.apis[0].savedAt, '2026-09-01T00:00:00.000Z');
  assert.equal(plan.apis[1].values.OPENAI_API_KEY, openai.value);
  assert.equal(plan.apis[1].savedAt, timestamp);
  assert.equal(plan.apis[2].values.XAI_API_KEY, additional.value);
  assert.equal(plan.apis[2].savedAt, timestamp);
  assert.equal(plan.apis[2].clipboardImported, true);
  assert.deepEqual(before[1].values, {});
  assert.equal(before.length, 2);
});

test('a later invalid row cannot mutate the earlier batch state', () => {
  const before = deepFreeze([service('openai', 'OPENAI_API_KEY')]);
  const good = credential(`OPENAI_API_KEY=sk-proj-${fake}`);
  assert.throws(() => planEnvImport(before, [good, { ...good, value: '' }], idFactory(), timestamp));
  assert.deepEqual(before[0].values, {});
  assert.equal(before[0].savedAt, undefined);
});

test('batch limits and unsafe or repeated card identifiers fail without changing input', () => {
  const before = deepFreeze([]);
  const selected = credential(`XAI_API_KEY=xai-${fake}`);
  assert.throws(() => planEnvImport(before, [], idFactory(), timestamp));
  assert.throws(() => planEnvImport(before, Array(201).fill(selected), idFactory(), timestamp));
  assert.throws(() => planEnvImport(before, [selected], () => '<unsafe-id>', timestamp));
  assert.throws(() => planEnvImport(before, [selected], idFactory(), 'invalid-time'));
  const different = { ...selected, value: selected.value + '-different' };
  assert.throws(() => planEnvImport(before, [selected, different], () => 'same-id', timestamp));
  assert.deepEqual(before, []);
});
