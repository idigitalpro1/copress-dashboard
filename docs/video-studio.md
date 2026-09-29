# SATCOM Video Studio (preview)

`/video/studio` is an operator-only editing studio for turning clips into branded social cuts, captions, thumbnails and SATCOM feed **drafts**. It does not publish anything. The public `/video` player, `/api/videos`, subscribe, Stripe and QR routes are unchanged.

## Access

The studio is **disabled by default**. The repository has no server-side admin session yet (the SATCOM operator gate in `index.html` is client-side only), so the studio uses its own env password:

- `VIDEO_STUDIO_PASSWORD` must be at least 12 characters. When it is missing or shorter, `/api/studio` returns `enabled:false`, and every operation returns 404.
- Signing in sets an HttpOnly, `SameSite=Strict`, `Secure` (on Vercel) cookie scoped to `/api/studio` for 12 hours. It is signed with a key derived from the password, so changing the password signs everyone out.
- Every POST must send `X-Studio-Request: 1`. The endpoint never grants CORS, so other sites cannot call it.
- Login attempts are throttled per instance (10 per 15 minutes per IP), with a 250 ms delay on every attempt.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VIDEO_STUDIO_PASSWORD` | yes (enables the studio) | Operator password, 12+ characters |
| `CLOUDINARY_URL` **or** `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` | yes for editing | Signed uploads, signed delivery URLs, renders, captions, drafts, image storage |
| `XAI_API_KEY` | optional | Grok copy (`XAI_MODEL`, default `grok-4.7`), Grok speech-to-text captions, Grok Imagine image generate/edit (`XAI_IMAGE_MODEL`, default `grok-imagine-image-2.0`) |
| `GEMINI_API_KEY_COPY` | optional | Preferred Gemini key for studio analysis, titles and transcription (`workload=copy`). Default model `gemini-3.5-flash` from the shared registry |
| `GEMINI_API_KEY` | optional | Documented fallback for copy (and Omni video) only — never used for Ask Susan |
| `GEMINI_API_KEY_VIDEO` | optional | Omni clip generation (`op: omni-submit`). Pin `gemini-omni-1.1-flash`. See [gemini.md](gemini.md) |
| `GEMINI_MODEL` | optional | Copy-model override; must be `gemini-3.5-flash` or `gemini-3.8-flash` |
| `VIDEO_STUDIO_UPLOAD_TYPE` | optional | `authenticated` (default) keeps raw uploads off public URLs; `upload` stores them as public |
| `VIDEO_STUDIO_LANGUAGE` | optional | Speech-to-text language hint, default `en` |

When AI keys are missing, the related buttons are disabled and the studio explains why. Captions can still be typed or pasted as SRT/WebVTT. None of these values reach the browser. The browser receives only per-upload signatures and signed Cloudinary URLs.

## What it does

1. **Clip:** Upload directly to Cloudinary using a server-signed upload. Files over 20 MB are uploaded in 20 MB chunks. You can also pick any video from the Cloudinary library.
2. **Trim:** Set in/out points from the playhead. The selection plays in the browser.
3. **Format and brand:** Crop to 9:16, 1:1 and 16:9 with `c_fill` (center, top, bottom or `g_auto` subject tracking). Presets for SATCOM, Colorado News Press, The Villager and Register-Call add a corner wordmark or uploaded logo and a timed lower third. These are edited in `lib/video-studio/brands.js`. To add a logo, choose the title and use **Upload logo**. It is stored at `satcom-studio/brand/<title>`.
4. **Captions:** Grok speech-to-text or Gemini transcribes the trimmed window into source-time cues, which you edit as SRT. Each render uploads a trimmed SRT as a raw asset and burns it in with `l_subtitles`.
5. **AI assist:** Grok (six frames plus the transcript) or Gemini (a low-res copy of the window, up to 4 minutes, plus the transcript) returns 3 titles, a description, an on-screen hook, hashtags, post copy for X, Facebook, Instagram, TikTok, YouTube Shorts and LinkedIn, and a suggested highlight of about 15 seconds that you can apply as the trim.
6. **Images:** Grok Imagine generates an image from a prompt or edits an uploaded, library or current-video-frame image. Results are saved to `satcom-studio/images`, tagged `ai-generated`. The branding step adds the same title presets plus a headline at 1:1, 4:5, 9:16, 16:9 and 1.91:1. You can download the graphics, save them to `satcom-studio/social`, or use one as the draft poster.
7. **Export:** Preview and download an MP4 for each format (`fl_attachment`). **Pre-render** queues Cloudinary eager async renders for long clips.
8. **Save as draft to SATCOM feed:** Builds a version-1 catalog entry with `status:"draft"` and `published:false`. It includes playback MP4, poster, WebVTT captions, social copy and studio provenance. The entry is stored privately in Cloudinary at `satcom-studio/drafts/<id>.json`, and the studio reports whether it would pass the public schema. `publicCatalog()` excludes any entry that is not `status:"published"` or that has `published:false`.

All video processing is done by Cloudinary transformations; no server FFmpeg.

## Publishing (manual)

Publishing remains a reviewed step: copy the draft JSON, set `status` to `published`, remove `published:false` and the studio-only fields if desired, and add it through the normal catalog path in `docs/video-network.md` (PR to `data/video-feed.json` or the connected catalog). Signed Cloudinary playback URLs do not expire, so the draft's MP4 URL works as a public playback URL once published. Anyone holding the URL can also view it before then.

## Limits and stubs

- Cloudinary renders on first request. Clips larger than the account's on-the-fly limit (about 40 to 100 MB depending on plan) need **Pre-render**.
- `g_auto` video cropping and Cloudinary text/subtitle layers use transformation quota. Fonts are Arial and Georgia. Custom brand fonts would need to be uploaded to Cloudinary.
- Drafts live in Cloudinary. They are not merged into the repository catalog or into the Supabase store proposed in PR #27; that bridge is a follow-up.
- The Google Cloud "ACE Video Ed" pipeline (Gemini analysis plus a 15-second FFmpeg highlight) is not deployed. The studio covers the same flow with the shared Gemini module (`packages/satcom-gemini`, workload `copy`) plus Cloudinary trims. Omni generation is async (`omni-submit` / cron poller) and stores **private** drafts under `satcom/generated/`. See [gemini.md](gemini.md). Preview only; do not merge; nothing is published.
- Login throttling is in-memory per function instance. Put Vercel deployment protection or a firewall rule in front for stronger protection.
