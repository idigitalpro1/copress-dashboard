import { resolveModel } from './registry.js';
import { selectKey } from './keys.js';
import { geminiFetch } from './http.js';
import { estimateCost, usageFromGenerateContent } from './cost.js';
import { assertLimits, recordSuccess, recordFailure } from './limits.js';
import { sanitizeUsageRow } from './store.js';
import { redact } from './redact.js';

export class WorkloadNotServedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkloadNotServedError';
    this.status = 501;
    this.expose = true;
    this.code = 'workload_not_served';
  }
}

export function extractText(data) {
  return (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
}

function isNoPhi(registry, workload) {
  return workload === 'health' || Boolean(registry.workloads[workload]?.noPhi);
}

export async function generateContent(client, { workload, parts, model, generationConfig, timeoutMs = 55000 }) {
  const { env, registry, fetchImpl, store, sleep, clock } = client;
  if (workload === 'video' || registry.workloads[workload]?.api === 'interactions') {
    throw new WorkloadNotServedError(
      "Video generation (Omni) runs on Patrick's server. This Vercel module only calls generateContent for copy (and health isolation tests).",
    );
  }
  const resolved = resolveModel(registry, workload, model);
  const { key, source } = selectKey(env, registry, workload);
  const now = clock();
  await assertLimits(store, registry, workload, { now });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolved.model}:generateContent`;
  const t0 = clock();
  let status = 'ok';
  let data;
  try {
    const response = await geminiFetch({
      fetchImpl, env, registry, workload, key, method: 'POST', url,
      body: { contents: [{ role: 'user', parts }], generationConfig },
      timeoutMs, sleep,
    });
    data = await response.json();
    await recordSuccess(store, workload, clock());
  } catch (error) {
    status = 'error';
    if (!error.status || error.status === 429 || error.status >= 500) {
      await recordFailure(store, registry, workload, clock());
    }
    throw error;
  } finally {
    const usage = usageFromGenerateContent(data || {});
    const cost = estimateCost(registry, { model: resolved.model, ...usage });
    const noPhi = isNoPhi(registry, workload);
    try {
      await store.insertUsage(sanitizeUsageRow({
        workload,
        model: resolved.model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        estimated_usd: cost.estimatedUsd,
        status,
        latency_ms: clock() - t0,
        metadata: noPhi ? {} : { key_source: source },
        created_at_ms: t0,
      }, { noPhi }));
    } catch { /* never let the usage log hide the API result */ }
  }
  return { text: extractText(data), model: resolved.model, usage: usageFromGenerateContent(data), data };
}

export function assertNoPhiLog(row) {
  const blob = JSON.stringify(row);
  if (/prompt|response|transcript|phi/i.test(blob) && (row.workload === 'health')) {
    throw new Error(redact('health usage log contained forbidden text fields', {}));
  }
}
