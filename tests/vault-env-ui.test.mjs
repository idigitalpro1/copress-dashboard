import test from 'node:test';
import assert from 'node:assert/strict';
import { setupEnvImport } from '../js/vault-env-ui.mjs';

const fakeValue = 'xai-FICTIONAL_UI_TEST_CREDENTIAL_0123456789';

class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.checked = false;
    this.open = false;
    this.showCount = 0;
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  dispatch(type) {
    if (type === 'click' && this.disabled) return Promise.resolve();
    return Promise.all((this.listeners.get(type) || []).map(handler => Promise.resolve().then(() => handler({ target: this }))));
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  add(option) { this.children.push(option); }
  click() { return this.dispatch('click'); }
  showModal() { this.open = true; this.showCount++; }
  close() {
    if (!this.open) return;
    this.open = false;
    for (const handler of this.listeners.get('close') || []) handler({ target: this });
  }
}

function createHarness(t, { storageFailure = false, renderFailure = false } = {}) {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  const original = Object.freeze([Object.freeze({
    id: 'xai-grok', name: 'xAI / Grok', cat: 'ai',
    fields: Object.freeze([Object.freeze({ key: 'XAI_API_KEY', label: 'API key' })]),
    values: Object.freeze({}),
  })]);
  const statuses = [];
  const confirmations = [];
  const revealed = [];
  let saveCalls = 0;
  let committed;
  let intakeCloses = 0;
  const globals = {
    document: { getElementById: get, createElement: tag => new Element(tag) },
    Option: class {
      constructor(text, value) { this.textContent = text; this.value = value; }
    },
    apis: original,
    saveVault() {
      saveCalls++;
      if (storageFailure) throw new Error('Fictional quota error');
      committed = JSON.parse(JSON.stringify(globalThis.apis));
    },
    formatVaultTime: () => 'Localized completion time',
  };
  const descriptors = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  const choices = new Map([['XAI_API_KEY', {
    name: 'xAI / Grok', cat: 'ai', envKey: 'XAI_API_KEY', label: 'xAI / Grok — API key',
  }]]);
  const cancelRead = setupEnvImport({
    choices,
    closeIntake() { intakeCloses++; },
    revealCard(id) {
      if (renderFailure) throw new Error('Fictional rendering error');
      revealed.push(id);
    },
    status: text => statuses.push(text),
    confirmCompletion: result => confirmations.push(result),
  });
  return {
    get, original, statuses, confirmations, revealed, cancelRead,
    get state() { return globalThis.apis; },
    get committed() { return committed; },
    get saveCalls() { return saveCalls; },
    get intakeCloses() { return intakeCloses; },
    load(text, read) {
      const bytes = new TextEncoder().encode(text);
      get('env-import-file').files = [{ size: bytes.byteLength, arrayBuffer: read || (() => Promise.resolve(bytes.buffer)) }];
      return get('env-import-file').dispatch('change');
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('canceling a pending file read prevents a later preview or save', async t => {
  const h = createHarness(t);
  const read = deferred();
  const loading = h.load('XAI_API_KEY=' + fakeValue, () => read.promise);
  await Promise.resolve();
  assert.equal(h.get('env-import-open').disabled, true);
  h.cancelRead();
  assert.equal(h.get('env-import-open').disabled, false);
  read.resolve(new TextEncoder().encode('XAI_API_KEY=' + fakeValue).buffer);
  await loading;
  assert.equal(h.get('env-import-dialog').showCount, 0);
  assert.equal(h.get('env-import-rows').children.length, 0);
  assert.equal(h.intakeCloses, 0);
  assert.equal(h.saveCalls, 0);
  assert.equal(h.state, h.original);
  assert.equal(h.confirmations.length, 0);
});

test('an obsolete read rejection cannot report an error after cancellation', async t => {
  const h = createHarness(t);
  const read = deferred();
  const loading = h.load('XAI_API_KEY=' + fakeValue, () => read.promise);
  await Promise.resolve();
  h.cancelRead();
  read.reject(new Error('Fictional read error'));
  await loading;
  assert.deepEqual(h.statuses, ['Reading .env locally. No keys have been saved.']);
  assert.equal(h.get('env-import-open').disabled, false);
  assert.equal(h.get('env-import-dialog').showCount, 0);
  assert.equal(h.saveCalls, 0);
});

test('storage failure preserves the original state and leaves review available without success', async t => {
  const h = createHarness(t, { storageFailure: true });
  await h.load('XAI_API_KEY=' + fakeValue);
  assert.equal(h.get('env-import-dialog').open, true);
  assert.equal(h.get('env-import-save').disabled, false);
  await h.get('env-import-save').click();
  assert.equal(h.saveCalls, 1);
  assert.equal(h.state, h.original);
  assert.equal(h.committed, undefined);
  assert.equal(h.confirmations.length, 0);
  assert.equal(h.revealed.length, 0);
  assert.equal(h.get('env-import-dialog').open, true);
  assert.equal(h.get('env-import-rows').children.length, 1);
  assert.equal(h.get('env-import-save').disabled, false);
  assert.match(h.get('env-import-summary').textContent, /No import was completed/);
});

test('a rendering failure after persistence never rolls back memory or reports a failed import', async t => {
  const h = createHarness(t, { renderFailure: true });
  await h.load('XAI_API_KEY=' + fakeValue);
  await assert.rejects(h.get('env-import-save').click(), /Fictional rendering error/);
  assert.equal(h.saveCalls, 1);
  assert.notEqual(h.state, h.original);
  assert.equal(h.state[0].values.XAI_API_KEY, fakeValue);
  assert.deepEqual(h.state, h.committed);
  assert.doesNotMatch(h.get('env-import-summary').textContent, /No import was completed|could not save/i);
  assert.equal(h.get('env-import-dialog').open, false);
  assert.equal(h.get('env-import-rows').children.length, 0);
  assert.equal(h.get('env-import-save').disabled, true);
});

test('canceling review clears its pending rows and prevents subsequent saving', async t => {
  const h = createHarness(t);
  await h.load('XAI_API_KEY=' + fakeValue);
  await h.get('env-import-cancel').click();
  assert.equal(h.get('env-import-dialog').open, false);
  assert.equal(h.get('env-import-rows').children.length, 0);
  assert.equal(h.get('env-import-save').disabled, true);
  await h.get('env-import-save').click();
  assert.equal(h.saveCalls, 0);
  assert.equal(h.state, h.original);
  assert.equal(h.confirmations.length, 0);
});

test('a successful import confirms the timestamp only after one complete storage write', async t => {
  const h = createHarness(t);
  await h.load('XAI_API_KEY=' + fakeValue);
  await h.get('env-import-save').click();
  assert.equal(h.saveCalls, 1);
  assert.equal(h.confirmations.length, 1);
  const completion = h.confirmations[0];
  assert.equal(completion.imported, 1);
  assert.equal(completion.duplicates, 0);
  assert.equal(completion.savedAt, h.committed[0].savedAt);
  assert.ok(Number.isFinite(Date.parse(completion.savedAt)));
  assert.equal(h.get('env-import-rows').children.length, 0);
  assert.equal(h.get('env-import-dialog').open, false);
  assert.match(h.statuses.at(-1), /1 keys saved from \.env/);
  assert.ok(!h.statuses.join('\n').includes(fakeValue));
});
