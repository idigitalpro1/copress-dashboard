# Shared Gemini client (Phase A, preview only — do not merge)

Unified Gemini integration for SATCOM Video Studio copy/captions, Omni news-clip generation, and (later, **not in this PR**) Health IQ Ask Susan. **Nothing in this phase publishes publicly or to YouTube.** Subscribe, Stripe, checkout, postcard QR routes, WordPress and DNS are unchanged.

Stacked on draft PR #29 (`cursor/video-studio-preview`). Preview env only.

## Module

Version **0.1.0** lives in `packages/satcom-gemini/` (`VERSION`, `CHANGELOG.md`, `registry/models.json`). Other projects pin a git commit or tag — see that package README. Health IQ (`idigitalpro1/HealthIQ`) is migrated last.

## Env vars Patrick must set (Preview only)

Do not put these on Production. Do not paste keys into chat or the repo.

| Variable | Workload | Required | Notes |
| --- | --- | --- | --- |
| `GEMINI_API_KEY_VIDEO` | Omni video | yes for generation | Own GCP project if possible |
| `GEMINI_API_KEY_COPY` | Studio captions + titles/copy | yes for Studio Gemini | Own GCP project if possible |
| `GEMINI_API_KEY_SUSAN` | Ask Susan (not called here) | no in this phase | Set on Health IQ later; **no fallback** |
| `GEMINI_API_KEY` | video **or** copy fallback | optional | Documented convenience only; never used for Ask Susan |
| `GEMINI_MODEL` | copy override | optional | Must be `gemini-3.5-flash` or `gemini-3.8-flash` |
| `SUPABASE_URL` | jobs + usage log | yes for durable Omni jobs | Server-side |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | jobs + usage log | yes for durable Omni jobs | **Server only.** Not the anon key. Never send to the browser. |
| `CRON_SECRET` | poller | recommended | Vercel Cron sends `Authorization: Bearer $CRON_SECRET` |
| `CLOUDINARY_URL` or `CLOUDINARY_*` | private draft upload | yes to store clips | Existing studio vars |
| `VIDEO_STUDIO_PASSWORD` | studio gate | yes to submit jobs | Existing studio var, 12+ characters |

SQL files in `supabase/migrations/` are **in the repo only**. They have not been applied. An operator must review and apply them to a Preview Supabase project — not production.

## Recommended billing hard caps

Patrick's Gemini **consumer / Google AI Studio subscription does not cover API charges.** Omni Flash is paid-tier only (~$0.10/s of 720p; 1080p is upscaled at the same listed rate).

Set a **Google Cloud billing-account hard cap** (cannot be overridden by this app):

| Cap | Amount | Why |
| --- | --- | --- |
| Billing account hard cap | **$150 / month** | Stops a leaked key or runaway loop |
| GCP project · video | $100 / month | Omni is the expensive path |
| GCP project · copy | $40 / month | Studio captions/titles |
| GCP project · ask_susan | $60 / month | Isolated from video |

In-app rolling caps (second line of defense only), from the registry:

- video: $15 / 24h, $100 / 30d, 4 requests/min, 2 concurrent jobs
- copy: $5 / 24h, $40 / 30d, 20 requests/min
- ask_susan: $8 / 24h, $60 / 30d, 30 requests/min

A runaway video job cannot spend the Ask Susan key or close the Ask Susan circuit.

## Models (verified 2026-09-29)

- Video pin: `gemini-omni-1.1-flash`. Denied: `gemini-omni-flash-preview` (shutdown 30 Sep 2026). Unknown ids fail closed.
- Optional Veo (not default): `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`.
- Copy/captions pin: `gemini-3.5-flash` (still listed; keeps Video Studio behavior). Allow-listed upgrade: `gemini-3.8-flash`. No invented ids, no `-latest` aliases.

## Async Omni jobs

Generation must not block a Vercel request. Flow:

1. Authenticated `POST /api/studio` `{ op: "omni-submit", brand, headline, script, aspect }` creates a `video_jobs` row and `POST`s the Interactions API with `background: true` (returns in seconds).
2. Poll `GET /api/studio` is not used for this. Status: `{ op: "omni-status", id }`.
3. Cron `GET /api/gemini/poll` (every minute) advances running jobs: poll interaction → download → **private** Cloudinary upload under `satcom/generated/` (alongside `satcom/paul-hill/originals`) plus a sidecar JSON (model, prompt, 1080p explicit, duration, SynthID / AI disclosure). `published: false`.

### Cron poller vs Cloud Run / Cloud Tasks

**Chosen: Vercel Cron poller** (`GET /api/gemini/poll`).

| Option | Needs new GCP access? | Fit |
| --- | --- | --- |
| Vercel Cron + this poller | No | Omni is already `background: true` on Google's side. We only poll. Uses existing Vercel project. |
| Cloud Run / Cloud Tasks worker | Yes (project, IAM, deploy) | Better for long downloads, but this phase must not require new GCP access. |

Tradeoff: Hobby Vercel only allows daily crons; a Pro/team plan is needed for `* * * * *`. Manual `{ op: "omni-poll" }` from the studio covers Hobby or a missed tick. Function `maxDuration` is 60s, so a large download that times out stays `running`/`downloading` and the next tick retries. Move to Cloud Run later if 1080p files regularly exceed that window.

Resolution is set on `response_format.resolution` (API reference). Switch `omni.resolutionPath` in the registry to `generation_config.video_config.resolution` if a live call rejects the reference path. Do not send both.

## Health IQ

Out of scope. The `ask_susan` workload exists so the client already isolates that key, budget, circuit and no-PHI log shape. Do not point Health IQ at this preview deployment.
