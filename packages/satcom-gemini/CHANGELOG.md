# Changelog

## 0.1.0 — 2026-09-29

Phase A of the shared Gemini client for Patrick Sweeney's newspaper group.

- Per-workload keys: `GEMINI_API_KEY_VIDEO`, `GEMINI_API_KEY_COPY`, `GEMINI_API_KEY_SUSAN`. No cross-workload fallback. Plain `GEMINI_API_KEY` is a documented fallback for video and copy only.
- Versioned `registry/models.json` plus price table. Video is pinned to `gemini-omni-1.1-flash`. `gemini-omni-flash-preview` (shutdown 2026-09-30) and unknown ids fail closed. Copy/captions use `gemini-3.5-flash` (verified 2026-09-29; Video Studio default). `gemini-3.8-flash` is allow-listed. Optional Veo ids are not the default.
- HTTP retries only on 429/5xx, max 3, with backoff. Keys redacted from errors and logs.
- Per-workload rolling budgets, rate limits and circuit breaker.
- Usage log (counts, dollars, model, status, latency). `ask_susan` never logs prompt or response text.
- Async Omni jobs: submit returns immediately after `background:true`; a Vercel cron poller finishes download and private Cloudinary draft upload.
- Python twin (`python/satcom_gemini.py`) reads the same registry JSON.
