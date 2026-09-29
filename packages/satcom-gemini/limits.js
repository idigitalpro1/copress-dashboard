export class BudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetExceededError';
    this.status = 429;
    this.expose = true;
    this.code = 'budget_exceeded';
  }
}

export class CircuitOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CircuitOpenError';
    this.status = 503;
    this.expose = true;
    this.code = 'circuit_open';
  }
}

export class RateLimitedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitedError';
    this.status = 429;
    this.expose = true;
    this.code = 'rate_limited';
  }
}

const DAY = 24 * 60 * 60 * 1000;
const MONTH = 30 * DAY;

export async function assertLimits(store, registry, workload, { now = Date.now(), estimatedUsd = 0 } = {}) {
  const spec = registry.workloads[workload];
  if (!spec) throw new BudgetExceededError(`Unknown workload '${workload}'.`);
  const circuit = await store.getCircuit(workload);
  if (circuit?.state === 'open') {
    const opened = Number(circuit.opened_at_ms) || 0;
    if (now - opened < (spec.circuit?.resetMs || 60_000)) {
      throw new CircuitOpenError(`Gemini ${workload} circuit is open. Retry later; this workload is isolated from the others.`);
    }
    await store.setCircuit(workload, { state: 'half_open', failures: circuit.failures, opened_at_ms: opened, updated_at_ms: now });
  }
  const recent = await store.countRecent(workload, now - 60_000);
  if (recent >= (spec.budget?.maxPerMinute || 20)) {
    throw new RateLimitedError(`Gemini ${workload} rate limit (${spec.budget.maxPerMinute}/min) reached.`);
  }
  const concurrent = await store.countActiveJobs?.() || 0;
  if (workload === 'video' && spec.budget?.maxConcurrent && concurrent >= spec.budget.maxConcurrent) {
    throw new RateLimitedError(`Gemini video already has ${concurrent} active jobs (cap ${spec.budget.maxConcurrent}).`);
  }
  const dayUsd = await store.sumUsage(workload, now - DAY);
  const monthUsd = await store.sumUsage(workload, now - MONTH);
  if (dayUsd + estimatedUsd > spec.budget.dailyUsd) {
    throw new BudgetExceededError(`Gemini ${workload} daily budget $${spec.budget.dailyUsd} would be exceeded.`);
  }
  if (monthUsd + estimatedUsd > spec.budget.monthlyUsd) {
    throw new BudgetExceededError(`Gemini ${workload} monthly budget $${spec.budget.monthlyUsd} would be exceeded.`);
  }
}

export async function recordSuccess(store, workload, now = Date.now()) {
  await store.setCircuit(workload, { state: 'closed', failures: 0, opened_at_ms: null, updated_at_ms: now });
}

export async function recordFailure(store, registry, workload, now = Date.now()) {
  const spec = registry.workloads[workload];
  const current = await store.getCircuit(workload) || { state: 'closed', failures: 0 };
  const failures = Number(current.failures || 0) + 1;
  const threshold = spec?.circuit?.failureThreshold || 5;
  if (failures >= threshold || current.state === 'half_open') {
    await store.setCircuit(workload, { state: 'open', failures, opened_at_ms: now, updated_at_ms: now });
  } else {
    await store.setCircuit(workload, { state: 'closed', failures, opened_at_ms: null, updated_at_ms: now });
  }
}
