# Creator upload link (Paul Hill)

Patrick approved this private phone-upload page. It is **not** a public form and it never publishes. Clips land as private Cloudinary drafts. The existing Video Studio review gate is the only path to YouTube or `/video`.

Locked decisions YAML could not be re-fetched from this agent (`idigitalpro1/codex` returned 404). Work followed the five locks in `AGENTS.md`: no QR / `/subscribe` / Stripe / DNS / price changes; drafts only; preview before production; no secrets in git; no PHI.

## URL

Production format:

```
https://satcom.conews.press/video/upload/<token>
```

`<token>` is 32–128 URL-safe characters (`A–Z a–z 0–9 _ -`). Paul does not sign in. An invalid or revoked token shows “This link is not available” and nothing else. The HTML file is `video/creator-upload.html` so Vercel `cleanUrls` does not collide with `/video/upload/<token>`.

## Create or revoke a token

**Default is no valid tokens.** The page stays a dead end until an operator sets one.

1. Generate a token (do not commit it, paste it in chat, or put it in a PR):

   `openssl rand -hex 32`

2. Set **`CREATOR_UPLOAD_TOKENS`** on the Vercel project `copress-dashboard` (Preview and/or Production). Formats:

   ```
   paul-hill|Paul Hill|<token>
   ```

   or JSON:

   ```
   [{"slug":"paul-hill","name":"Paul Hill","token":"<token>"}]
   ```

   Multiple creators: one `|` line per row, separated by newlines or `;`.

3. Redeploy after changing the env var. Paul’s production URL is the format above with that token.

**Revoke:** remove that row from `CREATOR_UPLOAD_TOKENS` and redeploy, or (if the optional table was applied) set `revoked_at` on the matching `token_hash`. The token hash is `sha256("creator-upload-v1:" + token)`.

Optional table (repo only, not applied by this change): `supabase/migrations/20261001080000_creator_upload_tokens.sql`. Service-role only, RLS on, no policies. Store the hash, `creator_slug`, and `creator_name`. Never store the raw token.

## Env vars (names only)

| Variable | Required | Notes |
| --- | --- | --- |
| `CREATOR_UPLOAD_TOKENS` | yes, to accept uploads | Safe default: unset / empty. No valid links. |
| `CLOUDINARY_URL` | already set | Browser uploads go directly to Cloudinary with a server signature. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | optional | Extra token table only. Unused if the table is not applied. |

Do not add or change `GEMINI_*`, `VIDEO_STUDIO_PASSWORD`, Stripe, subscribe, QR, or DNS vars for this page.

## What happens on upload

- The server signs only `public_id` (under `satcom/<creator-slug>/incoming/…`), `type=private`, `tags=draft,creator-upload`, `overwrite=false`, and context (`creator`, `note`, `uploaded_at`, `caption`).
- The browser uploads chunks straight to Cloudinary. Video bytes do not pass through a Vercel function.
- Allowed types: MP4, MOV, and similar video files. Cap: 4 GB per file. Basic per-IP / per-creator rate limit.
- Studio **Creator uploads (review queue)** lists these private drafts. Opening one uses the existing review/publish gate. Nothing auto-publishes.
