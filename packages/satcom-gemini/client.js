import { loadRegistry } from './registry.js';
import { generateContent } from './generate.js';
import { createStore } from './store.js';
import { VERSION } from './version.js';

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createGeminiClient({
  env = process.env,
  fetchImpl = (...a) => fetch(...a),
  store,
  clock = Date.now,
  sleep = defaultSleep,
  registry,
} = {}) {
  const resolvedRegistry = registry || loadRegistry();
  const resolvedStore = store || createStore(env, fetchImpl);
  const client = {
    version: VERSION,
    env,
    fetchImpl,
    store: resolvedStore,
    clock,
    sleep,
    registry: resolvedRegistry,
    generateContent: opts => generateContent(client, opts),
  };
  return client;
}
