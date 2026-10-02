import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseCredential, planCredentialImport } from '../js/vault-clipboard.mjs';
const fakeValue = 'fictional-credential-for-parser-tests-0123456789';

function assertSafeMetadata(result, expectedValue) {
  assert.equal(result.value, expectedValue);
  assert.equal(typeof result.name, 'string');
  assert.ok(result.name.trim());
  assert.match(result.envKey, /^[A-Z_][A-Z0-9_]*$/);
  assert.ok(['ai', 'data', 'comms', 'payments', 'maps', 'scraping', 'infra'].includes(result.cat));
  assert.ok(!result.name.includes(expectedValue), 'Credential must not become the card name');
  assert.ok(!result.envKey.includes(expectedValue), 'Credential must not become the environment name');
}

test('unknown raw credentials create a generic card and retain the entire value', () => {
  const value = 'opaque-token_0123456789==#segment/+tail';
  const result = parseCredential(value);
  assertSafeMetadata(result, value);
  assert.equal(result.name, 'Imported API key');
  assert.equal(result.envKey, 'CUSTOM_API_KEY');
  assert.equal(result.ambiguous, true);
});

test('recognizable raw key prefixes assign provider metadata without changing the key', async t => {
  const cases = [
    ['xai-', 'XAI_API_KEY', 'ai', /xai|grok/i],
    ['sk-proj-', 'OPENAI_API_KEY', 'ai', /openai/i],
    ['sk-ant-', 'ANTHROPIC_API_KEY', 'ai', /anthropic|claude/i],
    ['sk_live_', 'STRIPE_SECRET_KEY', 'payments', /stripe/i],
    ['sk_test_', 'STRIPE_SECRET_KEY', 'payments', /stripe/i],
    ['pk_live_', 'STRIPE_PUB_KEY', 'payments', /stripe/i],
    ['pk_test_', 'STRIPE_PUB_KEY', 'payments', /stripe/i],
    ['apify_api_', 'APIFY_API_TOKEN', 'scraping', /apify/i],
  ];
  for (const [prefix, envKey, cat, provider] of cases) {
    await t.test(prefix, () => {
      const value = prefix + fakeValue;
      const result = parseCredential(value);
      assertSafeMetadata(result, value);
      assert.equal(result.envKey, envKey);
      assert.equal(result.cat, cat);
      assert.match(result.name, provider);
      assert.equal(result.ambiguous, false);
    });
  }
});

test('Google-shaped and ambiguous sk- credentials are not assigned to an unsupported service', () => {
  const googleValue = 'AIza' + '0'.repeat(35);
  const google = parseCredential(googleValue);
  assertSafeMetadata(google, googleValue);
  assert.equal(google.name, 'Google API key');
  assert.equal(google.envKey, 'GOOGLE_API_KEY');
  assert.doesNotMatch(google.name, /gemini|places/i);
  assert.equal(google.ambiguous, true);

  const ambiguousValue = 'sk-' + fakeValue;
  const ambiguous = parseCredential(ambiguousValue);
  assertSafeMetadata(ambiguous, ambiguousValue);
  assert.equal(ambiguous.name, 'Imported API key');
  assert.equal(ambiguous.envKey, 'CUSTOM_API_KEY');
  assert.equal(ambiguous.ambiguous, true);
});

test('a raw Bearer header creates a card from the complete token', () => {
  const value = 'xai-' + fakeValue;
  const result = parseCredential('Bearer ' + value);
  assertSafeMetadata(result, value);
  assert.equal(result.envKey, 'XAI_API_KEY');
});

test('environment assignments preserve explicit identity and all value delimiters', () => {
  const value = 'opaque-token_0123456789==#segment/+tail';
  const result = parseCredential('PACKAGE_MY_DEAL_API_KEY=' + value);
  assertSafeMetadata(result, value);
  assert.equal(result.envKey, 'PACKAGE_MY_DEAL_API_KEY');
});

test('export and quoted environment values are ingested without retaining shell syntax', async t => {
  const value = 'opaque-token_0123456789==#segment/+tail';
  for (const quote of ['"', "'"]) {
    await t.test(quote === '"' ? 'double quoted' : 'single quoted', () => {
      const result = parseCredential(`export XAI_API_KEY=${quote}${value}${quote}`);
      assertSafeMetadata(result, value);
      assert.equal(result.envKey, 'XAI_API_KEY');
      assert.match(result.name, /xai|grok/i);
      assert.equal(result.ambiguous, false);
    });
  }
});

test('a named assignment wins over an ambiguous token prefix', () => {
  const value = 'AIza' + '0'.repeat(35);
  const result = parseCredential('GOOGLE_PLACES_KEY=' + value);
  assertSafeMetadata(result, value);
  assert.equal(result.envKey, 'GOOGLE_PLACES_KEY');
  assert.equal(result.cat, 'maps');
  assert.equal(result.ambiguous, false);
});

test('a generic Google environment label still requires the intended service', () => {
  const value = 'AIza' + '0'.repeat(35);
  const result = parseCredential('GOOGLE_API_KEY=' + value);
  assertSafeMetadata(result, value);
  assert.equal(result.envKey, 'GOOGLE_API_KEY');
  assert.equal(result.ambiguous, true);
});

test('a conflicting environment label and recognizable provider format requires confirmation', () => {
  const value = 'xai-FAKE_TEST_123456';
  const result = parseCredential('OPENAI_API_KEY=' + value);
  assertSafeMetadata(result, value);
  assert.equal(result.ambiguous, true);
});

test('one JSON environment value is ingested exactly', () => {
  const value = 'opaque-token_0123456789==#segment/+tail';
  const result = parseCredential(JSON.stringify({ XAI_API_KEY: value }));
  assertSafeMetadata(result, value);
  assert.equal(result.envKey, 'XAI_API_KEY');
  assert.equal(result.ambiguous, false);
});

test('surrounding clipboard whitespace is removed without truncating the token', () => {
  const value = 'xai-' + fakeValue;
  const result = parseCredential(` \t${value}\r\n`);
  assertSafeMetadata(result, value);
});

test('input boundaries allow an eight-character token and reject shorter credentials', () => {
  assertSafeMetadata(parseCredential('abcdefgh'), 'abcdefgh');
  assert.throws(() => parseCredential('abcdefg'));
});

test('oversized input is rejected before parsing', () => {
  assert.throws(() => parseCredential('x'.repeat(16385)));
});

test('invalid or multi-key clipboard content is rejected without echoing its contents', async t => {
  const marker = 'FICTIONAL_SENSITIVE_CONTENT_0123456789';
  const cases = [
    ['empty', ''],
    ['whitespace only', ' \t\n'],
    ['multiple assignments', `XAI_API_KEY=${marker}\nOPENAI_API_KEY=${marker}`],
    ['multiline token', `${marker}\n${marker}`],
    ['multiple JSON values', JSON.stringify({ XAI_API_KEY: marker, OPENAI_API_KEY: marker })],
    ['JSON non-string value', JSON.stringify({ XAI_API_KEY: { key: marker } })],
    ['JSON array', JSON.stringify([marker])],
    ['JSON invalid environment name', JSON.stringify({ 'invalid-name': marker })],
    ['malformed JSON', `{"XAI_API_KEY":"${marker}`],
    ['unclosed quote', `XAI_API_KEY="${marker}`],
    ['missing environment value', 'XAI_API_KEY='],
    ['empty quoted value', 'XAI_API_KEY=""'],
  ];
  for (const [label, input] of cases) {
    await t.test(label, () => {
      assert.throws(() => parseCredential(input), error => {
        assert.equal(typeof error.message, 'string');
        assert.ok(error.message.length > 0);
        assert.ok(!error.message.includes(marker), 'Errors must not echo pasted credentials');
        return true;
      });
    });
  }
});

function service(id, envKey, value, extraValues = {}) {
  return {
    id, name: id, cat: 'ai',
    fields: [{ label: 'API Key', key: envKey }],
    values: { ...extraValues, ...(value === undefined ? {} : { [envKey]: value }) },
  };
}

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
}

test('import fills the matching empty field and preserves every other saved value', () => {
  const credential = parseCredential('sk-proj-' + fakeValue);
  const before = deepFreeze([
    service('gemini', 'GOOGLE_AGENT_API_KEY', 'existing-unrelated-fake-key'),
    service('openai', 'OPENAI_API_KEY', undefined, { OPENAI_BASE_URL: 'https://example.invalid/v1' }),
  ]);
  const plan = planCredentialImport(before, credential, 'unused-id');
  assert.equal(plan.id, 'openai');
  assert.equal(plan.duplicate, false);
  assert.equal(plan.apis.length, before.length);
  assert.equal(plan.apis[0], before[0]);
  assert.deepEqual(plan.apis[1].values, {
    OPENAI_API_KEY: credential.value,
    OPENAI_BASE_URL: 'https://example.invalid/v1',
  });
  assert.equal(before[1].values.OPENAI_API_KEY, undefined);
  assert.notEqual(plan.apis, before);
  assert.notEqual(plan.apis[1].values, before[1].values);
});

test('the same key in the correct field focuses the existing card without duplicates', () => {
  const credential = parseCredential('xai-' + fakeValue);
  const before = deepFreeze([service('existing-xai', 'XAI_API_KEY', credential.value)]);
  const plan = planCredentialImport(before, credential, 'unused-id');
  assert.equal(plan.id, 'existing-xai');
  assert.equal(plan.duplicate, true);
  assert.equal(plan.apis, before);
});

test('a value previously saved in the wrong field still maps to its correct provider', () => {
  const credential = parseCredential('sk_live_' + fakeValue);
  const before = deepFreeze([
    service('incorrect-openai', 'OPENAI_API_KEY', credential.value),
    service('stripe', 'STRIPE_SECRET_KEY'),
  ]);
  const plan = planCredentialImport(before, credential, 'unused-id');
  assert.equal(plan.id, 'stripe');
  assert.equal(plan.duplicate, false);
  assert.equal(plan.apis[1].values.STRIPE_SECRET_KEY, credential.value);
  assert.equal(plan.apis[0], before[0], 'Existing entries are preserved for operator review');
  assert.equal(before[1].values.STRIPE_SECRET_KEY, undefined);
});

test('a new distinct key for an occupied provider creates a marked additional card', () => {
  const credential = parseCredential('xai-' + fakeValue);
  const before = deepFreeze([service('xai-grok', 'XAI_API_KEY', 'existing-xai-fictional-key')]);
  const original = JSON.stringify(before);
  const plan = planCredentialImport(before, credential, 'clipboard-test-distinct');
  assert.equal(plan.id, 'clipboard-test-distinct');
  assert.equal(plan.duplicate, false);
  assert.equal(plan.apis.length, 2);
  assert.equal(plan.apis[0], before[0]);
  assert.equal(JSON.stringify(before), original);
  const added = plan.apis[1];
  assert.equal(added.id, 'clipboard-test-distinct');
  assert.equal(added.clipboardImported, true);
  assert.equal(added.custom, true);
  assert.match(added.name, /additional key/i);
  assert.equal(added.fields[0].key, 'XAI_API_KEY');
  assert.equal(added.values.XAI_API_KEY, credential.value);
  assert.deepEqual(added.inject, []);
});

test('a new provider card does not mutate existing state', () => {
  const credential = parseCredential('apify_api_' + fakeValue);
  const before = deepFreeze([service('openai', 'OPENAI_API_KEY', 'existing-fictional-openai-key')]);
  const plan = planCredentialImport(before, credential, 'clipboard-new-provider');
  assert.equal(plan.apis.length, 2);
  assert.equal(plan.apis[0], before[0]);
  assert.equal(before.length, 1);
  assert.equal(plan.apis[1].cat, 'scraping');
  assert.equal(plan.apis[1].values.APIFY_API_TOKEN, credential.value);
  assert.equal(plan.apis[1].clipboardImported, true);
});

function createVaultHarness() {
  const html = readFileSync(new URL('../apistore.html', import.meta.url), 'utf8');
  const classicScript = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(classicScript, 'Expected the API Vault classic script');
  const storage = new Map();
  const nodes = new Map();
  const context = vm.createContext({
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, String(value)); },
    },
    document: {
      addEventListener() {},
      getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, { textContent: '' });
        return nodes.get(id);
      },
    },
  });
  vm.runInContext(classicScript + `
    globalThis.vaultHarness = {
      load: loadVault,
      save: saveVault,
      getApis: () => JSON.parse(JSON.stringify(apis)),
      setApis: value => { apis = value; },
    };
  `, context);
  return { ...context.vaultHarness, storage };
}

test('a separately imported xAI key survives the real save/load normalization without merging', () => {
  const vault = createVaultHarness();
  const original = {
    ...service('xai-grok', 'XAI_API_KEY', 'original-fictional-xai-key'),
    name: 'xAI / Grok', custom: true, inject: [], required: 'optional',
  };
  vault.storage.set('api_vault', JSON.stringify([original]));
  vault.load();
  const credential = parseCredential('xai-' + fakeValue);
  const savedAt = '2026-09-30T05:45:00.000Z';
  const plan = planCredentialImport(vault.getApis(), credential, 'clipboard-persistence-test', savedAt);
  vault.setApis(plan.apis);
  vault.save();
  const persisted = JSON.parse(vault.storage.get('api_vault'));
  assert.equal(persisted.find(api => api.id === plan.id).clipboardImported, true);

  vault.load();
  const reloaded = vault.getApis();
  const imported = reloaded.find(api => api.id === plan.id);
  assert.ok(imported, 'Imported card must keep its unique identity after reload');
  assert.equal(imported.values.XAI_API_KEY, credential.value);
  assert.equal(imported.fields[0].key, 'XAI_API_KEY');
  assert.equal(imported.clipboardImported, true);
  assert.equal(imported.savedAt, savedAt);
  assert.equal(reloaded.find(api => api.id === 'xai-grok').values.XAI_API_KEY, original.values.XAI_API_KEY);
  assert.equal(reloaded.filter(api => api.values.XAI_API_KEY).length, 2);
});

test('saved completion time survives the real default card save/load without inventing times for old cards', () => {
  const vault = createVaultHarness();
  vault.load();
  assert.equal(vault.getApis().find(api => api.id === 'openai').savedAt, '');
  const savedAt = '2026-09-30T05:45:01.000Z';
  const credential = parseCredential('sk-proj-' + fakeValue);
  const plan = planCredentialImport(vault.getApis(), credential, 'unused', savedAt);
  vault.setApis(plan.apis);
  vault.save();
  vault.load();
  const card = vault.getApis().find(api => api.id === 'openai');
  assert.equal(card.savedAt, savedAt);
  assert.equal(card.values.OPENAI_API_KEY, credential.value);
  const duplicate = planCredentialImport(vault.getApis(), credential, 'unused', '2026-10-01T00:00:00.000Z');
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.apis.find(api => api.id === 'openai').savedAt, savedAt);
});

test('reviewed imports preserve credential names containing URL across real save/load', () => {
  const vault = createVaultHarness();
  vault.load();
  const credential = parseCredential(JSON.stringify({ URLSCAN_API_KEY: fakeValue }));
  const plan = planCredentialImport(vault.getApis(), credential, 'clipboard-urlscan-test', '2026-09-30T05:45:01.000Z');
  vault.setApis(plan.apis);
  vault.save();
  vault.load();
  const card = vault.getApis().find(api => api.id === plan.id);
  assert.equal(card.fields.length, 1);
  assert.equal(card.fields[0].key, 'URLSCAN_API_KEY');
  assert.equal(card.values.URLSCAN_API_KEY, fakeValue);
  assert.equal(card.savedAt, '2026-09-30T05:45:01.000Z');
});
