# SATCOM Video Studio: production handoff

Merged to `main` and deployed to Production on Sep 29, 2026 (about 5:03 PM MT), with Patrick Sweeney's approval.
Merged PRs: #29 (Studio), #32 (Gemini copy client 0.2.0), #33 (review and publish gate). Final merge commit is `26c4b06`.

**Update, Sep 29, 2026 (about 5:30 PM MT):** #36 (review fixes) merged as `f047e63` and the Studio was turned on in Production with Patrick Sweeney's approval (deployment `dpl_8GZYyHDDPCpetYHUd2tSorDsXSB4`). The env table below shows what's set now.

## What's live

| URL (Production, `copress-dashboard` project) | State now |
| --- | --- |
| https://satcom.conews.press/video/studio | 200. The page is served with `noindex`, a strict CSP and `no-referrer`. |
| https://satcom.conews.press/api/studio | 200 `{"enabled":true,"authenticated":false}`. Operations need the Studio password sign-in. |
| https://satcom.conews.press/video and `/api/videos` | Same as before. The Git catalog is served, plus any items published through the Studio's satcom target. |

The same paths work on the other Production aliases (`copress-dashboard.vercel.app`, `satcom.copress.news`, `satcom.5280.menu`, `dev.conews.press`).
`/subscribe` behavior is unchanged, and so are the subscribe.thevillager.today redirect, other redirects, Stripe, QR routes, DNS and WordPress.

**The Studio is on in Production.** Uploads, renders and the YouTube connect work after sign-in. AI copy stays off until `GEMINI_KEY_COPY` or `XAI_API_KEY` is set in Production. Without Supabase, job, quota and token state uses the in-memory + cookie fallback.

## Architecture split

- **This repo (Vercel):** Studio UI and `/api/studio`. It handles Cloudinary edit, render and export; the Grok and Gemini *copy* features (captions, titles; key `GEMINI_KEY_COPY` only, with no `GEMINI_API_KEY` fallback); listing and opening generated drafts; the review and publish gate; YouTube OAuth and upload; and the satcom `/video` published overlay.
- **Patrick's server:** the Python Gemini client, the isolated `GEMINI_KEY_VIDEO` and `GEMINI_KEY_HEALTH` keys, the async **Gemini Omni video queue** and `publish_gate`. Finished clips are uploaded as **private** Cloudinary assets to `satcom/generated/` with a `{public_id}-sidecar` JSON, following the handoff contract in [gemini.md](gemini.md#handoff-contract-patricks-queue--studio). The Studio only lists and opens them.

## Env vars

| Variable | Preview | Production | Notes |
| --- | --- | --- | --- |
| `VIDEO_STUDIO_PASSWORD` | set | set | 12+ chars. Required to enable the Studio. One var targeting Preview + Production. |
| `CLOUDINARY_URL` | set | set | Needed for upload, render, drafts and the published overlay. One var targeting Preview + Production. |
| `XAI_API_KEY` | set | missing | Optional. Enables Grok copy, speech-to-text and Imagine. |
| `GEMINI_KEY_COPY` | **missing** | **missing** | Gemini copy and transcription. The Preview `GEMINI_API_KEY` is no longer read. |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | set (all branches) | set | Google OAuth Web client. |
| `YOUTUBE_TOKEN_ENC_KEY` | set (branch `cursor/video-studio-publish-0425`) | set (its own key) | 64 hex chars (`openssl rand -hex 32`). If you change it, reconnect the channel. |
| `YOUTUBE_REDIRECT_URI` | set (same branch) | set (`https://satcom.conews.press/api/studio/youtube-callback`) | Must exactly match the Google redirect URI. |
| `YOUTUBE_DAILY_UPLOAD_CAP`, `YOUTUBE_DEFAULT_PRIVACY` | set (same branch) | set (6, `unlisted`) | Optional. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | **missing** | **missing** | Optional durable store. Apply the migrations first. |
| `CREATOR_UPLOAD_TOKENS` | unset | unset | Optional. Empty means no creator upload links. See [creator-upload.md](creator-upload.md). |

If `SUPABASE_URL` is set before the migrations are applied, Studio boot stays up and reports `store.reason: migrations_not_applied` (in-memory + cookie fallback). Do not apply migrations from this repo.

## Review and publish gate rules

- Nothing publishes automatically. One editor approval creates two idempotent jobs, **YouTube** and **satcom.conews.press/video**, keyed by `sha256(public_id|version|target)`.
- Approval is blocked until all of these are true:
  - Title, description, captions and tags are each ticked as reviewed.
  - The reviewer name and date are filled in.
  - The rights/consent box is ticked (people on screen, music, Paul Hill's OK).
- Omni or AI-generated clips always send YouTube `containsSyntheticMedia=true` plus a visible AI disclosure line. The reviewer can't turn this off.
- YouTube uploads default to `unlisted` (or `private`) and never `public`. The daily **editorial** cap defaults to 6 (our choice, not a Google limit); anything past the cap shows "queued until tomorrow". Google's default `videos.insert` bucket is 100 calls/day as of the [quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost) update on 2026-09-15.
- Only a failed target is retried; a target that succeeded never posts twice. Unpublishing sets YouTube to private or deletes the video, and removes the entry from the satcom overlay.
- The satcom target creates a public Cloudinary copy only at approval time and writes `satcom-studio/published/catalog.json`, which is merged into `/api/videos`. Drafts stay private.

## YouTube setup (Patrick)

Full checklist: [youtube.md](youtube.md).
1. In Google Cloud:
   - Enable YouTube Data API v3.
   - Set up the OAuth consent screen: External, Testing, with yourself as a test user.
   - Add the scopes `youtube.upload` and `youtube.force-ssl`.
2. Create an OAuth client of type **Web application** with these authorized redirect URIs:
   - Preview: `https://copress-dashboard-git-cursor-video-studio-publish-0425-5280menu.vercel.app/api/studio/youtube-callback`
   - Production: `https://satcom.conews.press/api/studio/youtube-callback`
3. Set the client ID and secret (plus the other vars above) in Vercel, starting with Preview. Set `YOUTUBE_REDIRECT_URI` per environment.
4. Connect the channel once: sign in at `/video/studio`, then go to Review & publish → Connect YouTube channel.
5. A quota increase is **not required** for the editorial 6/day cap. Google's default (quota calculator, **2026-09-15**) is 100 `videos.insert` calls/day in their own bucket, plus 10,000 units/day for other endpoints. The old 1,600 units/upload figure is obsolete. See [youtube.md](youtube.md) if you later need more than 100 uploads/day.

## Unapplied Supabase migrations (repo only)

- `supabase/migrations/20260929120000_gemini_usage.sql`
- `supabase/migrations/20260929120100_gemini_circuit.sql`
- `supabase/migrations/20260929200000_video_publish_jobs.sql`
- `supabase/migrations/20260929200100_youtube_oauth_and_quota.sql`
- `supabase/migrations/20260929200200_video_publish_reviews_and_audit.sql`
- `supabase/migrations/20260929200300_video_feed_published.sql`
- `supabase/migrations/20261001030000_youtube_quota_units_pool.sql`
- `supabase/migrations/20261001080000_creator_upload_tokens.sql`

Apply these to a Preview project first. Without them, job, quota and token state is kept in per-instance memory.

## Review fixes (PR follow-up on #33)

Addressed on a later branch: OAuth `SameSite=Lax` + signed state; cookie token fallback; graceful `migrations_not_applied`; quota counts only successful uploads; YouTube idempotency (existing video id + in-flight lock); queue drain on Studio boot; catalog writes merge store-published items and refuse a failed overlay read; catalog merge test uses an injected fixture.

## Rollback

**Studio go-live (#36 + Production env vars):** the Production deployment before it is **`dpl_G1WrVFCYoKgg8q6m4SuipAfZkdtv`** (commit `bd07c73`, copress-dashboard-lac1wohhk-5280menu.vercel.app). A rollback doesn't remove env vars. To turn the Studio off quickly, take Production off the `VIDEO_STUDIO_PASSWORD` targets and redeploy.

**Original release (#29/#32/#33):**

The Production deployment before this merge is **`dpl_BRf8CMMLZv7NuCGcMMWHczZMm4sr`** (commit `cfa3e37`, copress-dashboard-jlfh8drpf-5280menu.vercel.app).
To roll back:
1. In Vercel, open copress-dashboard → Deployments, find that deployment, then choose **Instant Rollback** (or run `vercel rollback dpl_BRf8CMMLZv7NuCGcMMWHczZMm4sr`).
2. Instant rollback turns off auto-promotion of new `main` pushes. Re-enable it by promoting a new deployment, or revert the three merge commits on `main` (`26c4b06`, `6a429e8`, `13fe8d5`) in a PR.

The original release didn't change any env vars, domains or DNS. The go-live only added the Production env vars listed above. Domains, DNS, redirects, `/subscribe`, Stripe and QR routes were not changed.
