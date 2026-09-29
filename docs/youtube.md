# YouTube publish (SATCOM Video Studio)

Preview only — do not merge. This document is the operator checklist for Patrick. The Studio never calls YouTube unless these steps are done on a **Preview** project. Do not set these variables on Production. This repository does not create the Google Cloud OAuth client, does not click consent, and does not file the quota request.

Uploads are **never automatic**. Approval in the Studio review gate is required. Default privacy is `unlisted` (or `private` if you set `YOUTUBE_DEFAULT_PRIVACY=private`). Omni / `ai-generated` clips always send `status.containsSyntheticMedia = true` and a visible AI disclosure line in the description.

## Env vars (Preview only)

Set these on the Vercel Preview project yourself. Do not paste secrets into chat or the repo.

| Variable | Required | Purpose |
| --- | --- | --- |
| `YOUTUBE_CLIENT_ID` | yes | OAuth 2.0 Web client ID |
| `YOUTUBE_CLIENT_SECRET` | yes | OAuth 2.0 Web client secret (**server only**) |
| `YOUTUBE_TOKEN_ENC_KEY` | yes | 32-byte AES-256-GCM key as **64 hex characters**. Encrypts the refresh token at rest |
| `YOUTUBE_REDIRECT_URI` | recommended | Must match the Google Cloud authorized redirect URI exactly. Example: `https://<preview-host>/api/studio/youtube-callback` |
| `YOUTUBE_DAILY_UPLOAD_CAP` | optional | Default **6** (YouTube default quota ≈ 6 uploads/day at 1,600 units each) |
| `YOUTUBE_DEFAULT_PRIVACY` | optional | `unlisted` (default) or `private`. Never defaults to `public` |

Also required for the satcom.conews.press/video target: existing Cloudinary studio vars. Optional durable store: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` after you apply the SQL files in `supabase/migrations/` to a **Preview** project (not production).

If none of the YouTube trio is set, the Studio still builds. The review gate renders in a disabled / **not connected** state.

## Steps Patrick must do himself

### 1. Google Cloud project + YouTube Data API v3

1. Open [Google Cloud Console](https://console.cloud.google.com/) in the GCP project you want for SATCOM YouTube (keep it off the Gemini video project if you want quota isolation).
2. Enable **YouTube Data API v3** (APIs & Services → Library).
3. Note the project number; you will need it for the quota form.

### 2. OAuth consent screen

1. APIs & Services → **OAuth consent screen**.
2. User type: **External**.
3. App name e.g. `SATCOM Video Studio`, support email = your Google account.
4. Scopes to add (minimum for upload + status update + delete):
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.force-ssl`
5. Publishing status may stay **Testing**. Add your Google account (the one that owns the Colorado News Press / Paul Hill channel) as a **test user**.
6. Do not add `/auth/youtube` (full) unless you later need more than upload/update/delete.

### 3. Create the OAuth client

1. APIs & Services → Credentials → **Create credentials** → OAuth client ID.
2. Application type: **Web application**.
3. Name e.g. `SATCOM Video Studio Preview`.
4. Authorized JavaScript origins: the Preview origin (`https://<preview-host>`).
5. Authorized redirect URIs — **exact match**, including `https`:
   - `https://<preview-host>/api/studio/youtube-callback`
   - `http://localhost:3000/api/studio/youtube-callback` if you run `npm run dev` locally
6. Copy the client ID and secret into the Preview env vars above.
7. Generate `YOUTUBE_TOKEN_ENC_KEY` locally (`openssl rand -hex 32`) and set it once. Rotating it invalidates the stored refresh token; reconnect the channel.

Preview URLs change per deployment. Prefer a stable Preview alias, or update the redirect URI and `YOUTUBE_REDIRECT_URI` when the host changes.

### 4. One-time channel connect

1. Sign in to `/video/studio` with `VIDEO_STUDIO_PASSWORD`.
2. Open **Review & publish** → **Connect YouTube channel**.
3. Google will ask you to grant the two scopes to the channel that should receive uploads.
4. On success you return to the Studio with `?youtube=connected`. The refresh token is encrypted with `YOUTUBE_TOKEN_ENC_KEY` and stored server-side. Without Supabase it is also written to a signed HttpOnly `satcom_yt` cookie so the Studio function can see it after Google's redirect. After you apply the Supabase migration it lives in `youtube_oauth_tokens`.
5. Tokens never go to the browser.

Use the Google account that already has permission on the destination YouTube channel. Brand accounts: pick that channel on the Google account picker.

### 5. File the YouTube API quota increase

Default YouTube Data API quota is **10,000 units/day**. `videos.insert` costs **1,600 units**, so the Studio caps uploads at **6/day** and surfaces **queued until tomorrow** when the cap is hit.

When you need more, use [YouTube Data API quota extension](https://support.google.com/youtube/contact/yt_api_form) (or APIs & Services → YouTube Data API v3 → Quotas → request increase). Suggested justification (edit names/URLs before sending):

> Colorado News Press / SATCOM (satcom.conews.press) publishes short local news clips from reporter Paul Hill for community newspapers in the Clear Creek County, Colorado area (The Villager, Weekly Register-Call). We upload only editor-approved finished reports — typically a few short MP4s per day, not a user-generated platform. Each upload is a manual Studio approval (never a bot or cron). We request an increase from 10,000 to 50,000 units/day so we can publish roughly 20 reviewed clips/day during heavy local news weeks (elections, wildfire, high school sports) without hitting the default ~6 uploads/day ceiling. We set `status.containsSyntheticMedia=true` on any Gemini Omni / AI-generated cut and keep default privacy unlisted until an editor flips it. No live streaming from this client. Project: [GCP project id]. Redirect: [preview host]/api/studio/youtube-callback.

Keep the request factual. Do not claim production scale you do not have.

## What the Studio does after connect

- Review gate: side-by-side source vs draft, AI-field reviewed checkboxes, required name + date, rights/consent, locked synthetic disclosure for Omni clips.
- One **Approve** creates two idempotent jobs (`youtube`, `satcom`) keyed by `public_id + version + target`.
- YouTube: resumable `videos.insert` with `privacyStatus` unlisted/private and `containsSyntheticMedia` when required. Retry of a succeeded job does not upload again. Unpublish sets **private** or **deletes** via the API.
- satcom.conews.press/video: public Cloudinary delivery is derived **only at approve time**; a catalog overlay is merged into `/api/videos`. See [video-studio.md](video-studio.md).

SQL in `supabase/migrations/` is in the repo only. Do not apply it to production from this PR.
