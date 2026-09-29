# @satcom/gemini 0.1.0

Shared Gemini client for SATCOM Video Studio (copy/captions), Omni news clips, and — later, in a **separate** repo — Health IQ Ask Susan. **Share this module, not the API key.**

This package is preview-only. It does not publish to YouTube, the public `/api/videos` feed, WordPress, or any postcard QR route.

## Pin a specific version

The module is versioned with semver (`VERSION`, `package.json`, `CHANGELOG.md`). Other projects should pin a **git commit or tag**, not `main`.

**This repo (JavaScript):**

```js
// copress-dashboard at a known commit
import { createGeminiClient } from '../packages/satcom-gemini/index.js';
```

**Another Node repo (Health IQ is last; do not migrate it in this phase):**

```bash
# subtree or copy at a pinned SHA
git subtree add --prefix vendor/satcom-gemini \
  https://github.com/idigitalpro1/copress-dashboard.git \
  <commit-sha> --squash
# then only keep packages/satcom-gemini/
```

Or copy `packages/satcom-gemini/` at the tagged version (`v0.1.0` / this commit) and do not edit `registry/models.json` locally except to bump the pin in a reviewed PR.

**Python (news_video.py):**

```python
from satcom_gemini import load_registry, resolve_model, select_key, redact
registry = load_registry()  # same registry/models.json
model = resolve_model(registry, "video")          # gemini-omni-1.1-flash
key, source, fallback = select_key(os.environ, registry, "video")
```

Keep `news_video.py` pointed at this registry so Omni cannot drift back to `gemini-omni-flash-preview`.

## Workloads and keys

| Workload | Primary env | Fallback | Default model |
| --- | --- | --- | --- |
| `video` | `GEMINI_API_KEY_VIDEO` | `GEMINI_API_KEY` | `gemini-omni-1.1-flash` |
| `copy` | `GEMINI_API_KEY_COPY` | `GEMINI_API_KEY` | `gemini-3.5-flash` |
| `ask_susan` | `GEMINI_API_KEY_SUSAN` | **none** | `gemini-3.5-flash` |

Ask Susan must never use the video key or vice versa. Ideally each key comes from a separate GCP project.

`GEMINI_API_KEY` fallback is **only** for video and copy, for local/preview convenience. It is not used for `ask_susan`.

## Env vars (Preview only — do not set production)

See [docs/gemini.md](../../docs/gemini.md) for the full list, recommended billing hard caps, Omni job routes, and the Cloud Run vs cron tradeoff.

## Tests

HTTP is mocked. Do not call the live Gemini API from CI.
