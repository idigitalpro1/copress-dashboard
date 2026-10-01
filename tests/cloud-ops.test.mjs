import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCloudOps, createGoogleIdentity, diagnoseCloudOps, FEED } from '../lib/cloud-ops.js';
import { createCloudOpsHandler } from '../api/studio/cloud-ops.js';
import { issueSession } from '../lib/video-studio/auth.js';

test('missing identity reports private checks unavailable and reads only public feed', async () => {
  const urls = [];
  const snapshot = await collectCloudOps({ identity: createGoogleIdentity({ env: {} }), fetchImpl: async url => {
    urls.push(url); return new Response(JSON.stringify({ items: [{ title: 'Do not expose source titles' }] }));
  } });
  assert.deepEqual(urls, [FEED]);
  assert.equal(snapshot.coverage, 'partial');
  assert.equal(snapshot.checks.find(c => c.name === 'published_feed').published_clips, 1);
  assert.equal(snapshot.checks[0].reason, 'identity_not_configured');
  assert.ok(!JSON.stringify(snapshot).includes('Do not expose'));
});
test('identity rejects arbitrary project or account before obtaining tokens', async () => {
  let called = false;
  const identity = createGoogleIdentity({ env: { GOOGLE_OPS_WIF_AUDIENCE: '//iam.googleapis.com/projects/other/locations/global/workloadIdentityPools/a/providers/b', GOOGLE_OPS_SERVICE_ACCOUNT: 'other@example.com' }, oidc: () => { called = true; } });
  await assert.rejects(identity.accessToken()); assert.equal(called, false);
});
test('cloud projections omit private source identifiers and expose failed executions', async () => {
  const identity = { accessToken: async () => 'test-access', idToken: async () => 'test-id' };
  const fetchImpl = async (url, options) => {
    assert.ok(!options.method || options.method === 'GET');
    let value;
    if (url === FEED) value = { items: [] };
    else if (url.includes('/videos?')) value = { videos: [{ file_id: 'private-drive-id', title: 'Private title' }] };
    else if (url.includes('/executions?')) value = { executions: [{ failedCount: 2, succeededCount: 0, completionTime: '2026-09-30T00:00:00Z', name: 'private-name' }] };
    else if (url.includes('/timeSeries?')) value = { timeSeries: [{ points: [{ value: { int64Value: '3' } }] }] };
    else value = { terminalCondition: { state: 'CONDITION_SUCCEEDED' }, containers: [{ env: [{ value: 'private-config' }] }] };
    return new Response(JSON.stringify(value));
  };
  const snapshot = await collectCloudOps({ identity, fetchImpl });
  assert.equal(snapshot.coverage, 'complete');
  assert.equal(snapshot.checks.find(c => c.name === 'recent_executions').executions[0].failed_tasks, 2);
  assert.equal(snapshot.checks.find(c => c.name === 'recent_server_errors').server_errors, 3);
  assert.equal(snapshot.checks.find(c => c.name === 'drive_intake').has_source, true);
  assert.ok(!JSON.stringify(snapshot).includes('private-'));
});
test('Gemini receives only the server snapshot and has no action tools', async () => {
  const result = await diagnoseCloudOps({ mode: 'read-only', checks: [] }, { identity: { accessToken: async () => 'test-token' }, fetchImpl: async (url, options) => {
    assert.ok(url.endsWith(':generateContent'));
    const body = JSON.parse(options.body); assert.equal(body.tools, undefined);
    assert.equal(body.generationConfig.maxOutputTokens, 1200);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Evidence unavailable.' }] } }] }));
  } });
  assert.equal(result.status, 'draft'); assert.equal(result.text, 'Evidence unavailable.');
});
function response() { return { headers: {}, setHeader(k,v) { this.headers[k]=v; }, end(value) { this.body = JSON.parse(value); } }; }
test('unauthenticated and malformed cookie requests never query Google', async () => {
  let called = false;
  const handler = createCloudOpsHandler({ env: {}, collect: () => { called = true; } });
  for (const cookie of ['', 'satcom_studio=%invalid']) {
    const res = response(); await handler({ method: 'GET', headers: { cookie } }, res);
    assert.equal(res.statusCode, 401);
  }
  assert.equal(called, false);
});
test('authenticated endpoint rejects repair operations and missing CSRF header', async () => {
  const env = { VIDEO_STUDIO_PASSWORD: 'test-only-password-value' };
  const cookie = `satcom_studio=${issueSession(env)}`;
  let called = false;
  const handler = createCloudOpsHandler({ env, collect: () => { called = true; } });
  const res = response(); await handler({ method: 'POST', headers: { cookie, 'x-studio-request': '1' }, body: { op: 'restart' } }, res);
  assert.equal(res.statusCode, 400);
  const res2 = response(); await handler({ method: 'POST', headers: { cookie }, body: { op: 'diagnose' } }, res2);
  assert.equal(res2.statusCode, 403); assert.equal(called, false);
});
