# satcom-receptionist-mcp-server

MCP server exposing two tools to the ElevenLabs Conversational AI receptionist agent drafted in `../data/satcom-elevenlabs-receptionist-agent.md`:

- **`take_message`** — logs a caller's name, callback number, department, and summary, and forwards it to an operator-configured webhook (n8n, Slack, email relay — whatever the operator points `MESSAGE_WEBHOOK_URL` at). Never claims a message was received if delivery failed.
- **`list_departments`** — read-only directory of the five network SIP extensions (Patrick, Editorial, Subscriptions, Advertising, Production), sourced from the same extension list documented in the root `README.md`'s "3CX SIP Extensions" section and `network.html`.

This is a standalone project, deliberately decoupled from the static-HTML Vercel deploy that serves the rest of `copress-dashboard`. It is **not wired into `vercel.json`** and does not deploy automatically from this repo — `api/mcp.ts` and `api/health.ts` are deployed separately as a manual file upload to their own Vercel project (see Deploying below), unlinked to any GitHub repo.

## Status

**Deployed, but inert.** Live at `https://eleven-claude.vercel.app` (Vercel project `eleven-claude`, team 5280menu). `MCP_AUTH_TOKEN` has not been set on that deployment yet, so `POST /mcp` currently returns `500` for every request — this is the intended fail-closed behavior, not a bug. It has no path to the live `+1 877-357-8499` receptionist number unless an operator sets the token, configures `MESSAGE_WEBHOOK_URL`, and deliberately points an ElevenLabs agent at it.

## Setup

```bash
npm install
npm run build
```

## Running

**Local (stdio) — for testing with the MCP Inspector or a local MCP client:**

```bash
npm run dev
# or after building:
node dist/index.js
```

**Local (streamable HTTP), via `src/index.ts` + Express** — an alternative to the Vercel deployment below, for running this alongside the existing Hermes/API Vault services instead:

```bash
TRANSPORT=http MCP_AUTH_TOKEN=<shared-secret> MESSAGE_WEBHOOK_URL=<intake-webhook-url> PORT=3000 node dist/index.js
```

**Deployed (Vercel), what's actually live** — `api/mcp.ts` and `api/health.ts` are separate serverless functions (no `app.listen`, no Express at request time); `vercel.json` rewrites `/mcp` → `/api/mcp` and `/health` → `/api/health` so the public paths match what's documented everywhere else. Live at `https://eleven-claude.vercel.app`.

Either way, `POST /mcp` requires `Authorization: Bearer <shared-secret>` on every request — set the same value as a custom header when adding this as a custom MCP server in the ElevenLabs agent config. `GET /health` is unauthenticated and returns `{ ok: true }` for uptime checks.

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `TRANSPORT` | No (default `stdio`) | Set to `http` to run the remote streamable-HTTP server. |
| `PORT` | No (default `3000`) | HTTP listen port in `http` mode. |
| `MCP_AUTH_TOKEN` | Yes, in `http` mode | Shared secret ElevenLabs must send as `Authorization: Bearer <token>`. One named key, one task — do not reuse a token issued for anything else. |
| `MESSAGE_WEBHOOK_URL` | No, but `take_message` cannot deliver without it | Where taken messages are POSTed as JSON: `{ caller_name, callback_number, department, summary, urgent, taken_at }`. |

None of these belong in git. Set them in the hosting platform's environment/secrets panel.

## Testing

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Call `list_departments` first (no side effects) to confirm the directory looks right, then `take_message` with a test payload and confirm `delivered` reflects the real webhook outcome — not just `true` by default.

## Deploying

Already deployed once, manually, to a standalone Vercel project (`eleven-claude`, team 5280menu, unlinked to any GitHub repo — deployed by uploading the source files directly, not via git push). To redeploy after code changes, either repeat that manual upload or connect the project to this repo's `claude/agent-eleven-labs-zk75q6` branch / a later `main` merge with root directory `satcom-receptionist-mcp-server` (Vercel → Project Settings → Git).

**Still required before this does anything real:** set `MCP_AUTH_TOKEN` (and `MESSAGE_WEBHOOK_URL` once a real intake endpoint exists) on the `eleven-claude` project — Vercel Dashboard → `eleven-claude` → Settings → Environment Variables — then redeploy so the new values are picked up. Kept off the static dashboard's deploy pipeline on purpose, so a bad push to this server can never break `copress-dashboard.vercel.app`.
