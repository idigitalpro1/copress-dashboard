import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { safeRedirectPath } from '../lib/clerk-gate.js';

const origin = 'https://satcom.5280.menu';
const browserSource = await readFile(new URL('../js/clerk-auth.js', import.meta.url), 'utf8');
const validTargets = [
  ['/', '/'],
  ['/apikeys', '/apikeys'],
  ['/apistore#inject', '/apistore#inject'],
  ['/kanban?x=1#preview', '/kanban?x=1#preview'],
  ['/tools/../apikeys', '/apikeys'],
  ['/./apistore', '/apistore'],
  ['/apikeys?return=//example.invalid', '/apikeys?return=//example.invalid'],
  ['/%2f%2fexample.invalid', '/%2f%2fexample.invalid'],
  ['/%5cexample.invalid', '/%5cexample.invalid'],
];
const rejectedTargets = [
  '', null, undefined,
  'https://example.invalid', 'https://satcom.5280.menu/apikeys', 'javascript:alert(1)',
  '//example.invalid', '///example.invalid', '/\\example.invalid', '/path\\child',
  '/\n/example.invalid', '/\r/example.invalid', '/\t/example.invalid',
  '/tools/..//example.invalid', '/%2e%2e//example.invalid', '/tools/%2e%2e//example.invalid', '/.//example.invalid',
];
const controlTargets = [...Array.from({ length: 32 }, (_, code) => code), 127]
  .map(code => '/' + String.fromCharCode(code) + '/example.invalid');

function assertLocalTarget(actual, expected) {
  assert.equal(actual, expected);
  assert.equal(actual.startsWith('//'), false);
  assert.equal(new URL(actual, origin).origin, origin);
}

// Run the actual classic browser script, with inert doubles for Clerk and every network/DOM operation.
// Query encoding deliberately exercises URLSearchParams decoding before the redirect guard.
function runSignIn(value, signedIn) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Browser sign-in fixture did not finish')), 1000);
    const finish = result => { clearTimeout(timeout); resolve(result); };
    const fail = error => { clearTimeout(timeout); reject(error); };
    const params = new URLSearchParams();
    if (value !== undefined && value !== null) params.set('redirect_url', value);
    const elements = { 'sign-in': {}, 'clerk-status': { textContent: '' } };
    const clerk = {
      isSignedIn: signedIn,
      load: async () => {},
      mountSignIn: (element, options) => {
        assert.equal(element, elements['sign-in']);
        finish({ kind: 'mount', ...options });
      },
    };
    const context = {
      URL, URLSearchParams,
      atob: value => Buffer.from(value, 'base64').toString('binary'),
      location: { origin, search: '?' + params.toString(), replace: target => finish({ kind: 'replace', target }) },
      window: { Clerk: clerk },
      document: {
        currentScript: { dataset: { clerkMode: 'signin' } },
        getElementById: id => elements[id] || null,
        createElement: () => ({ setAttribute() {} }),
        head: { appendChild: script => script.onload() },
      },
      fetch: async path => {
        assert.equal(path, '/api/auth-config');
        return { ok: true, json: async () => ({
          publishableKey: 'pk_test_' + Buffer.from('clerk-fixture.example$').toString('base64'),
        }) };
      },
      console: { error: (_message, error) => fail(error) },
    };
    try { vm.runInNewContext(browserSource, context, { timeout: 1000 }); }
    catch (error) { fail(error); }
  });
}

test('server redirect guard preserves local paths, queries and fragments with URL normalization', () => {
  for (const [value, expected] of validTargets) assertLocalTarget(safeRedirectPath(value), expected);
});

test('server redirect guard rejects external, control, backslash and normalized double-slash targets', () => {
  for (const value of [...rejectedTargets, ...controlTargets]) assertLocalTarget(safeRedirectPath(value), '/');
});

test('signed-out browser mounts Clerk sign-in with safe destinations for both sign-in and sign-up', async () => {
  for (const [value, expected] of [
    ...validTargets,
    ...[...rejectedTargets, ...controlTargets].map(value => [value, '/']),
  ]) {
    const result = await runSignIn(value, false);
    assert.equal(result.kind, 'mount');
    assertLocalTarget(result.forceRedirectUrl, expected);
    assertLocalTarget(result.signUpForceRedirectUrl, expected);
  }
});

test('already-signed-in browser returns only to a safe normalized local destination', async () => {
  for (const [value, expected] of [
    ...validTargets,
    ...[...rejectedTargets, ...controlTargets].map(value => [value, '/']),
  ]) {
    const result = await runSignIn(value, true);
    assert.equal(result.kind, 'replace');
    assertLocalTarget(result.target, expected);
  }
});
