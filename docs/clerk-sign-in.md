# SATCOM operator sign-in (Clerk)

SATCOM operator pages now require a real, server-side sign-in. The old operator gate was cosmetic
(an "I'm signed in" button) and its Google/Microsoft links depended on `admin.conews.press`, which is down.

## How it works
- `middleware.js` (Vercel Routing Middleware) runs on the gated paths and calls `lib/clerk-gate.js`.
- Signed out: pages redirect to `/sign-in` (Clerk `<SignIn/>`), APIs return `401`.
- Signed in but no verified email on `ALLOWED_EMAILS`: pages go to `/sign-in?forbidden=1`, APIs return `403`.
- Clerk keys missing: pages and APIs return `503` (fail closed).
- Gated pages load `js/clerk-auth.js`, which shows a `<UserButton/>` (top-right) and keeps the session fresh.
- `/api/whoami` is Clerk-protected and returns the signed-in, allowlisted email.
- `/api/auth-config` returns only the public publishable key for the browser.

## Gated
`/` (operator console), `/apistore` + `/apikeys`, `/csv-manager`, `/linear`, `/newsletter`, `/briefing`,
`/video/studio` (page; its API keeps the existing Video Studio password), `/api/whoami`.

## Deliberately left public (existing features)
`/mcp` (read-only MCP, LOCK-013), `/codex`, `/kanban` + `/api/development-board` (public development view,
same data as MCP `satcom_board`), `/video` + `/api/videos` (network embed feed), creator upload links
(per-creator tokens), `/api/studio/youtube-callback`, campaign kits, `/subscribe-villager`, and every path on
`subscribe.thevillager.today` (LOCK-003).

## Env (Vercel, Preview + Production; values never in git)
`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (sensitive), `ALLOWED_EMAILS` (comma-separated).
Clerk app: shared dev instance with billing.conews.press, the invoice manager and NewsFlow.

## Rollback
Revert the PR (or remove `middleware.js`) and redeploy. Removing the env vars alone locks the gated pages (503).
