import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../operating-status.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const status = sandbox.window.SATCOM_OPERATING;

test('a stored key is not a green ready state', () => {
  assert.equal(status.integrationLabel({ stored: true, check: null }), 'Stored · unchecked');
  assert.equal(status.dotClass({ stored: true, check: null }), 'stored');
  assert.notEqual(status.dotClass({ stored: true, check: null }), 'live');
});

test('a missing key stays unchecked', () => {
  assert.equal(status.integrationLabel({ stored: false, check: null }), 'Unchecked');
  assert.equal(status.dotClass({}), '');
  assert.equal(status.subscriberText(null), '—');
  assert.equal(status.subscriberText(Number.NaN), '—');
});

test('only a successful provider check is live and counted', () => {
  const check = { ok: true, checkedAt: '2026-10-02T00:20:00.000Z', count: 1200 };
  assert.equal(status.integrationLabel({ stored: true, check }), 'Checked');
  assert.equal(status.dotClass({ stored: true, check }), 'live');
  assert.equal(status.subscriberText(check.count), '1,200');
  assert.notEqual(status.formatCheckedAt(check.checkedAt), '—');
  assert.equal(status.formatCheckedAt(''), '—');
  assert.equal(status.dotTitle('live'), 'Provider check succeeded');
  assert.match(status.dotTitle('stored'), /Not a provider check/);
});

test('a failed provider check is unavailable, not ready', () => {
  const check = { ok: false, checkedAt: '2026-10-02T00:20:00.000Z' };
  assert.equal(status.integrationLabel({ stored: true, check }), 'Unavailable');
  assert.equal(status.dotClass({ stored: true, check }), 'unavailable');
  assert.equal(status.OWNER, 'Operations lead');
});

test('the dashboard no longer paints Ready from a stored key or the 847 placeholder', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /src="\/operating-status\.js"/);
  assert.doesNotMatch(html, /sendy_key'\) \? 'Ready'/);
  assert.doesNotMatch(html, /stripe_secret'\) \? 'Ready'/);
  assert.doesNotMatch(html, /id="live-subscribers">847/);
  assert.doesNotMatch(html, /id="marketing-module-subs">847/);
  assert.match(html, /integrationLabel\(\{/);
  assert.match(html, /id="sendy-checked-at"/);
  assert.match(html, /id="stripe-checked-at"/);
});
