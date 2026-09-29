import { createGeminiClient, createStore, supabaseConfigured } from '../packages/satcom-gemini/index.js';
import { cloudinaryConfig, uploadGeneratedDraft } from './video-studio/cloudinary.js';

export function createGeminiPollHandler({
  getEnv = () => process.env,
  fetchImpl = (...a) => fetch(...a),
  clock = Date.now,
  store,
  sleep,
} = {}) {
  return async function handler(req, res) {
    const env = getEnv();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'Method not allowed.' }));
      return;
    }
    const secret = env.CRON_SECRET;
    const auth = String(req.headers?.authorization || '');
    if (secret) {
      if (auth !== `Bearer ${secret}`) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'Unauthorized.' }));
        return;
      }
    } else if (env.VERCEL) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'CRON_SECRET is not set.' }));
      return;
    }
    try {
      if (env.VERCEL && !store && !supabaseConfigured(env)) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'Supabase is not configured for Omni job polling.' }));
        return;
      }
      const resolvedStore = store || createStore(env, fetchImpl);
      const gemini = createGeminiClient({ env, fetchImpl, store: resolvedStore, clock, sleep });
      const cfg = cloudinaryConfig(env);
      const jobs = await gemini.pollVideoJobs({
        limit: 8,
        upload: cfg ? (payload => uploadGeneratedDraft(cfg, payload, fetchImpl, clock())) : undefined,
      });
      res.statusCode = 200;
      res.end(JSON.stringify({
        ok: true,
        polled: jobs.length,
        jobs: jobs.filter(Boolean).map(j => ({ id: j.id, status: j.status, published: false })),
        note: 'Preview poller. Private Cloudinary drafts only. Nothing published.',
      }));
    } catch (error) {
      res.statusCode = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
      res.end(JSON.stringify({ error: error?.expose ? String(error.message).slice(0, 300) : 'Poll failed.' }));
    }
  };
}
