# Changelog

## 0.2.0 — 2026-09-29

Patrick owns the Python Gemini client, isolated keys on his server, the async Omni queue, and publish_gate. This package is the Vercel / Video Studio side only.

- Env vars renamed to match Patrick: `GEMINI_KEY_VIDEO`, `GEMINI_KEY_COPY`, `GEMINI_KEY_HEALTH`. The former `ask_susan` workload is `health`. There is **no** `GEMINI_API_KEY` fallback.
- Python twin removed. Omni submit/poll, `/api/gemini/poll`, `video_jobs`, and the Vercel cron entry removed.
- Studio lists and opens private Cloudinary drafts under `satcom/generated/` (alongside `satcom/paul-hill/originals`) via the handoff contract in `registry/models.json`.
- JS module still serves **copy** (captions, titles, descriptions) with no-PHI usage logging, per-workload budgets and a circuit breaker. `generateContent` refuses the video/Omni workload.

## 0.1.0 — 2026-09-29

Phase A of the shared Gemini client (superseded by 0.2.0). Had a Python twin, in-repo Omni queue, `GEMINI_API_KEY_*` names and a documented `GEMINI_API_KEY` fallback for video and copy.
