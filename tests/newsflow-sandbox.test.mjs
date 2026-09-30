import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialSandboxRunState,
  sandboxExportDetails,
  sandboxRunReducer,
} from '../services/mcp-vault/src/components/Sandbox/runState.ts';

const result = {
  output: 'Fixture output', latencyMs: 25, modelUsed: 'fixture-model', provider: 'fixture',
  promptTokens: 10, completionTokens: 5, estimatedCostUsd: null,
  timestamp: '2026-09-30T12:00:00Z',
};

function start(state, id = 1, outputFormat = 'json', model = 'fixture-model') {
  return sandboxRunReducer(state, { type: 'start', id, model, outputFormat });
}

function succeed(state, id = 1) {
  return sandboxRunReducer(state, { type: 'success', id, result });
}

test('a new failed run cannot leave the preceding output, metrics, or copy state visible', () => {
  let state = succeed(start(initialSandboxRunState));
  state = sandboxRunReducer(state, { type: 'copy', id: 1, copied: true });
  assert.equal(state.copied, true);
  state = start(state, 2);
  assert.equal(state.completedRun, null);
  assert.equal(state.copied, false);
  state = sandboxRunReducer(state, { type: 'failure', id: 2, error: 'Provider unavailable' });
  assert.equal(state.completedRun, null);
  assert.equal(state.pendingRun, null);
  assert.equal(state.error, 'Provider unavailable');
});

test('editing any run input invalidates a completed result and previous errors', () => {
  const completed = succeed(start(initialSandboxRunState));
  const changed = sandboxRunReducer(completed, { type: 'invalidate' });
  assert.equal(changed.completedRun, null);
  assert.equal(changed.revision, completed.revision + 1);
  const failed = sandboxRunReducer(start(changed, 2), { type: 'failure', id: 2, error: 'Failed' });
  assert.equal(sandboxRunReducer(failed, { type: 'invalidate' }).error, null);
});

test('changed input during execution discards a late success without pretending to cancel the request', () => {
  let state = start(initialSandboxRunState, 1, 'markdown', 'original-model');
  state = sandboxRunReducer(state, { type: 'invalidate' });
  assert.equal(state.pendingRun.model, 'original-model');
  assert.notEqual(state.pendingRun.revision, state.revision);
  assert.equal(start(state, 2), state, 'keep the paid pending call blocked until it settles');
  state = succeed(state);
  assert.equal(state.pendingRun, null);
  assert.equal(state.completedRun, null);
});

test('editing and reverting input still discards the obsolete in-flight response', () => {
  let state = start(initialSandboxRunState);
  state = sandboxRunReducer(state, { type: 'invalidate' });
  state = sandboxRunReducer(state, { type: 'invalidate' });
  assert.equal(succeed(state).completedRun, null);
});

test('a failure for changed input cannot attach an old error to current settings', () => {
  let state = start(initialSandboxRunState);
  state = sandboxRunReducer(state, { type: 'invalidate' });
  state = sandboxRunReducer(state, { type: 'failure', id: 1, error: 'Old input failed' });
  assert.equal(state.pendingRun, null);
  assert.equal(state.completedRun, null);
  assert.equal(state.error, null);
});

test('out-of-order responses and clipboard completion cannot change a newer run', () => {
  let state = succeed(start(initialSandboxRunState));
  state = start(state, 2);
  assert.equal(succeed(state, 1), state);
  assert.equal(sandboxRunReducer(state, { type: 'failure', id: 1, error: 'Late failure' }), state);
  state = succeed(state, 2);
  assert.equal(sandboxRunReducer(state, { type: 'copy', id: 1, copied: true }), state);
  assert.equal(state.completedRun.id, 2);
});

test('export extension and content type come from the completed run format, including raw text', () => {
  for (const [format, extension, mimeType] of [
    ['json', 'json', 'application/json;charset=utf-8'],
    ['markdown', 'md', 'text/markdown;charset=utf-8'],
    ['text', 'txt', 'text/plain;charset=utf-8'],
  ]) {
    const completed = succeed(start(initialSandboxRunState, 1, format));
    assert.equal(completed.completedRun.outputFormat, format);
    assert.deepEqual(sandboxExportDetails(completed.completedRun.outputFormat), { extension, mimeType });
  }
});

test('execution validation failure also clears a preceding result without starting a provider request', () => {
  const completed = succeed(start(initialSandboxRunState));
  const failed = sandboxRunReducer(completed, { type: 'validation-error', error: 'Execution disabled' });
  assert.equal(failed.pendingRun, null);
  assert.equal(failed.completedRun, null);
  assert.equal(failed.error, 'Execution disabled');
});
