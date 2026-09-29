import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REGISTRY_PATH = join(dirname(fileURLToPath(import.meta.url)), 'registry', 'models.json');
let cached;

export class ModelDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelDeniedError';
    this.status = 400;
    this.expose = true;
    this.code = 'model_denied';
  }
}

export function loadRegistry(source = REGISTRY_PATH) {
  if (source === REGISTRY_PATH && cached) return cached;
  const registry = typeof source === 'string'
    ? JSON.parse(readFileSync(source, 'utf8'))
    : structuredClone(source);
  if (!registry?.workloads || !registry.denied) {
    throw new ModelDeniedError('Gemini registry is missing workloads or denied models.');
  }
  if (source === REGISTRY_PATH) cached = registry;
  return registry;
}

export function listAllowed(registry, workload) {
  const spec = registry.workloads[workload];
  if (!spec) throw new ModelDeniedError(`Unknown Gemini workload '${workload}'.`);
  return [...(spec.allowedModels || []), ...(spec.optionalModels || [])];
}

export function resolveModel(registry, workload, requested) {
  const spec = registry.workloads[workload];
  if (!spec) throw new ModelDeniedError(`Unknown Gemini workload '${workload}'.`);
  const model = requested || spec.defaultModel;
  if (typeof model !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(model)) {
    throw new ModelDeniedError('Invalid Gemini model id.');
  }
  const denied = registry.denied[model];
  if (denied) {
    throw new ModelDeniedError(
      `Model '${model}' is denied (${denied.reason || 'deprecated'}). Replacement: ${denied.replacement || 'none'}.`,
    );
  }
  const allowed = listAllowed(registry, workload);
  if (!allowed.includes(model)) {
    throw new ModelDeniedError(
      `Model '${model}' is not on the ${workload} allow-list. Refusing to run (fail closed).`,
    );
  }
  if (spec.defaultModel && registry.denied[spec.defaultModel]) {
    throw new ModelDeniedError(
      `Default model '${spec.defaultModel}' for ${workload} is denied. Refusing to run (fail closed).`,
    );
  }
  return { model, spec, optional: (spec.optionalModels || []).includes(model) };
}

export function failClosedModel(registry, workload, requested) {
  return resolveModel(registry, workload, requested).model;
}
