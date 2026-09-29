import { loadRegistry } from './registry.js';
import { generateContent } from './generate.js';
import { startInteraction, getInteraction, downloadVideoBytes, buildOmniPayload } from './omni.js';
import { submitVideoJob, pollVideoJobs, advanceJob } from './jobs.js';
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
    startInteraction: opts => startInteraction(client, opts),
    getInteraction: (id, opts) => getInteraction(client, id, opts),
    downloadVideoBytes: (video, opts) => downloadVideoBytes(client, video, opts),
    buildOmniPayload: opts => buildOmniPayload({ registry: resolvedRegistry, ...opts }),
    submitVideoJob: input => submitVideoJob(client, input),
    pollVideoJobs: opts => pollVideoJobs(client, opts),
    advanceJob: (job, opts) => advanceJob(client, job, opts),
  };
  return client;
}
