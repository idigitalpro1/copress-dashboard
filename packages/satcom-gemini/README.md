# @satcom/gemini 0.2.0

Vercel / SATCOM Video Studio Gemini **copy** client. **Share this module, not the API key.**

Patrick Sweeney owns the Python client, the three isolated keys on his server, the async Omni generation queue, and `publish_gate`. This package does not duplicate that work. It does not publish to YouTube, the public `/api/videos` feed, WordPress, or any postcard QR route.

## Pin a specific version

The module is versioned with semver (`VERSION`, `package.json`, `CHANGELOG.md`). Other projects should pin a **git commit or tag**, not `main`.

```js
import { createGeminiClient } from '../packages/satcom-gemini/index.js';
```

## Workloads and keys

| Workload | Env | This repo calls Gemini? | Default model |
| --- | --- | --- | --- |
| `copy` | `GEMINI_KEY_COPY` | yes (`generateContent`) | `gemini-3.5-flash` |
| `video` | `GEMINI_KEY_VIDEO` | **no** — Patrick's server | `gemini-omni-1.1-flash` (sidecar fail-closed) |
| `health` | `GEMINI_KEY_HEALTH` | no (isolation tests only) | `gemini-3.5-flash` |

Never fall back across workloads. **`GEMINI_API_KEY` is not read.** Video Studio Gemini assist on this stacked preview needs `GEMINI_KEY_COPY`. The earlier Video Studio preview (PR #29) used `GEMINI_API_KEY`; that name is no longer a fallback so a missing `GEMINI_KEY_COPY` disables Gemini copy/transcription rather than silently using a shared key.

Health (formerly Ask Susan) must never use the video key or vice versa. Ideally each key comes from a separate GCP project.

## What this repo does not do

- Call the Omni Interactions API
- Queue, poll, or download generated video
- Run a Vercel cron poller
- Ship a Python twin of this client

Finished clips arrive as **private** Cloudinary assets under `satcom/generated/`. The Studio lists and opens them. See [docs/gemini.md](../../docs/gemini.md) for the handoff contract (folder, tags, sidecar JSON).

## Env vars (Preview only — do not set production)

See [docs/gemini.md](../../docs/gemini.md) for the full list, recommended billing hard caps, and the Cloudinary handoff.

## Tests

HTTP is mocked. Do not call the live Gemini API from CI.
