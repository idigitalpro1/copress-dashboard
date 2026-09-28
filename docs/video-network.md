# Colorado News Press video network

One public catalog supplies Paul Hill's carousel across the 5280.menu network. The API returns approved playback metadata; the browser streams media directly from the video host. This service does not ingest camera feeds, transcode originals, allocate 500 GB, or serve video bytes from GitHub.

## Place the player

Open `/video` on the deployed SATCOM host to choose a publication, town and appearance and copy the embed. After production release, a network-wide embed is:

```html
<script src="https://satcom.5280.menu/video/widget.js"
  data-creator="paul-hill" data-theme="dark" defer></script>
```

Paste it into a page's Custom HTML block. Sites must permit this script and the SATCOM iframe in their Content Security Policy. No parent-site CSS or application framework is required. Width and height adapt to the containing page. For CMS platforms that remove scripts, use:

```html
<iframe src="https://satcom.5280.menu/video/embed?creator=paul-hill"
  title="Paul Hill reporting" width="100%" height="780"
  style="border:0" allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen loading="lazy"></iframe>
```

The plain iframe has a fixed height; the script embed adjusts it automatically. Add `data-publication="weekly-register-call"`, `data-town="idaho-springs"`, `data-theme="light"` or `data-rotate="false"` to the script. Matching iframe query parameters omit the `data-` prefix. Reuse the same host on all sites so they receive the same feed.

Cards rotate every eight seconds while idle. Rotation pauses during playback, hover, keyboard focus, when offscreen or when the tab is hidden. Reduced-motion users start with rotation paused. Audio starts only after a viewer presses Play. The player supports native MP4, native or hls.js HLS, and privacy-enhanced YouTube embeds. Domain restrictions set by the media provider still apply.

## Editorial handoff and publication

1. Paul uploads originals to the existing editorial Drive handoff. Collaborators review/edit there.
2. Publish the approved final to your existing video host and obtain a public HTTPS MP4/HLS playback URL or an embeddable YouTube video ID. Drive folder/upload links are not playback URLs.
3. Prefer the login-protected SATCOM form at `/video/submit` (2026-09-27 exception). That creates a `pending_review` row, texts opted-in reviewers, and keeps `/api/videos` read-only. Reviewers can approve by SMS (`YES K7Q2`) or on `/video/review` after opening `/video/review-continue`. Until Supabase is configured, a reviewed change to `data/video-feed.json` remains the catalog fallback.
4. Verify `/api/videos?creator=paul-hill` and the player. Each embedded player refreshes every 30 seconds. A Git-based catalog update requires deployment first; a connected or database catalog update does not.

Keep originals, consent records, internal notes, contact details and private links outside this public repository. Never store tokens or unpublished confidential records in the catalog: repository history remains visible even when an item is not returned by the API. The raw catalog HTTP path redirects to the filtered API before static-file routing.

An example entry is shown below; these example URLs must be replaced. No sample footage is included in the production feed.

```json
{
  "version": 1,
  "items": [{
    "id": "paul-hill-idaho-springs-001",
    "title": "Reporting from Idaho Springs",
    "description": "An approved report description.",
    "creator": "paul-hill",
    "credit": "Paul Hill · Colorado News Press",
    "publications": ["network"],
    "towns": ["idaho-springs"],
    "published_at": "2026-09-27T12:00:00Z",
    "status": "published",
    "kind": "recorded",
    "poster_url": "https://media.example.com/report.jpg",
    "playback": {"type": "mp4", "url": "https://media.example.com/report.mp4"},
    "captions": [{"url": "https://media.example.com/report.vtt", "language": "en", "label": "English"}]
  }]
}
```

Use `publications: ["network"]` for all publications, or explicit publication slugs for selective distribution. Town filtering requires a matching town slug. For HLS set `playback.type` to `hls`; the provider must allow cross-origin access to playlists, segments and keys. Caption files and caption-enabled MP4s must also allow cross-origin access. For YouTube use `{"type":"youtube","video_id":"YOUR_11_CHAR_ID"}` with a real 11-character ID; enable embedding at the provider.

## Connect an updating catalog

Configure server environment variables on the existing SATCOM project. This repository is public: never commit secrets, reviewer phone numbers, or personal data.

| Variable | Purpose |
| --- | --- |
| `VIDEO_FEED_URL` | Fixed HTTPS endpoint returning the version-1 catalog above |
| `VIDEO_FEED_TOKEN` | Optional bearer token sent only by the server to that endpoint |
| `SATCOM_VIDEO_SUPABASE_URL` or `SUPABASE_URL` | Supabase project URL for schema `satcom_video` |
| `SATCOM_VIDEO_SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role. Never expose to the browser. |
| `SATCOM_VIDEO_SESSION_SECRET` | Random secret (≥32 bytes) for review/submit cookies |
| `SATCOM_VIDEO_SUBMIT_USER` / `SATCOM_VIDEO_SUBMIT_PASSWORD` | Login for `/video/submit` only |
| `SATCOM_VIDEO_PUBLIC_URL` | Public origin used in magic links and Twilio signatures. Example: `https://satcom.5280.menu` |
| `SATCOM_VIDEO_SMS_PROVIDER` | `inkbox` (default) or `twilio` |
| `SMS_DRY_RUN` | Defaults **on**. Set `false` only when the publisher authorizes live SMS. Preview and tests stay dry-run. |
| `SATCOM_VIDEO_MAGIC_LINK_TTL_HOURS` | 24–72, default 48 |
| `SATCOM_VIDEO_CODE_TTL_HOURS` | Reply-code lifetime, default 72 |
| `INKBOX_API_KEY` | Inkbox API key (`X-API-Key`) |
| `INKBOX_PHONE_NUMBER_ID` | Inkbox phone number UUID used to send SMS |
| `INKBOX_WEBHOOK_SECRET` or `INKBOX_SIGNING_KEY` | Identity signing key. Optional `whsec_` prefix is stripped. |
| `INKBOX_WEBHOOK_AUTH_TOKEN` | Optional subscription `auth_token`; required as `Authorization: Bearer` when set |
| `INKBOX_API_BASE_URL` | Optional, default `https://inkbox.ai/api/v1` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | Twilio fallback adapter |

These values are never accepted from a browser query or returned to visitors. When the Supabase pair is set, published `satcom_video.videos` rows feed `/api/videos`. If they are unset, `VIDEO_FEED_URL` is used when present; otherwise the reviewed repository catalog is the fallback. No public write API is created. The 2026-09-27 SATCOM review page is a scoped exception to the one-admin rule, not a second editorial admin.

Apply `supabase/migrations/20260927120000_satcom_video.sql` manually to the chosen project. Do not insert reviewer phones in git. After a reviewer row exists, that person texts `START` to the SATCOM video number to opt in, `STOP` to opt out, and `HELP` for instructions. Point the Inkbox `text.received` subscription (and optional Twilio webhook) at `/api/video-review-sms`.

For a real live camera broadcast, send the camera/encoder to the chosen streaming provider. Add the provider's HLS playback URL or YouTube live video ID with `kind: "live"`. A connected catalog should refresh `live_confirmed_at` with the current ISO timestamp only while its provider confirms the broadcast is active. The LIVE badge expires after two minutes without this heartbeat; a persistent channel URL alone is labeled status unconfirmed. Ingest keys must stay with the encoder/provider, never in this feed.

## API contract

`GET /api/videos?creator=paul-hill&publication=weekly-register-call&town=idaho-springs&limit=12`

Optional slug filters are combined. Limit defaults to 12 and ranges from 1–50. CORS permits public reads from any origin; GET, HEAD and OPTIONS are supported. Drafts, scheduled future entries and unknown/internal fields are omitted. Live entries with a fresh heartbeat sort first, then newest recordings. IDs must be unique.

Responses contain `version`, `channel`, `status`, `source`, `refreshed_at`, `refresh_seconds`, `count`, and `items`. Status is `ready` or `empty`. Invalid queries return 400, writes return 405, source/schema failures return 503 without upstream details. After a refresh failure, the player labels the retained playlist as stale and removes LIVE badges. Removing an entry from a healthy catalog removes it from open players on the next refresh; this does not revoke a provider's public media URL.

## Release and verification

Run `npm test` and `npm run build`. The build validates the catalog and copies pinned hls.js and its license into `video/vendor/`. That directory is generated, not committed. `npm run dev` serves the API and player locally.

Use the branch deployment for review. Follow the repository's current explicit-merge rule before merging to production. Check `/video`, `/api/videos`, `/video/embed`, the generated HLS asset, and an embed on a second origin. Confirm playback using the real approved source before adding embeds across the ecosystem. No video has been published or broadcast merely by installing this code.
