# satcom-receptionist-mcp-server

MCP server exposing two tools to the ElevenLabs Conversational AI receptionist agent drafted in `../data/satcom-elevenlabs-receptionist-agent.md`:

- **`take_message`** — logs a caller's name, callback number, department, and summary, and forwards it to an operator-configured webhook (n8n, Slack, email relay — whatever the operator points `MESSAGE_WEBHOOK_URL` at). Never claims a message was received if delivery failed.
- **`list_departments`** — read-only directory of the five network SIP extensions (Patrick, Editorial, Subscriptions, Advertising, Production), sourced from the same extension list documented in the root `README.md`'s "3CX SIP Extensions" section and `network.html`.

This is a standalone project, deliberately decoupled from the static-HTML Vercel deploy that serves the rest of `copress-dashboard`. It is **not wired into `vercel.json`** and will not deploy automatically — it needs its own hosting decision (its own Vercel project, or running alongside the existing Hermes/API Vault services) before it does anything.

## Status

Draft / not yet deployed. Building and running this locally is safe — it only starts a local server and, if `MESSAGE_WEBHOOK_URL` isn't set, refuses to deliver anything (it logs the failure instead of pretending to succeed). It has no path to the live `+1 877-357-8499` receptionist number unless an operator deliberately points ElevenLabs at it.

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

**Remote (streamable HTTP) — what ElevenLabs' Integrations → MCP Servers panel needs:**

```bash
TRANSPORT=http MCP_AUTH_TOKEN=<shared-secret> MESSAGE_WEBHOOK_URL=<intake-webhook-url> PORT=3000 node dist/index.js
```

The server listens on `POST /mcp` and requires `Authorization: Bearer <shared-secret>` on every request — set the same value as a custom header when adding this as a custom MCP server in the ElevenLabs agent config. `GET /health` is unauthenticated and returns `{ ok: true }` for uptime checks.

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

Not decided yet — this needs an operator call on where it runs (its own small Vercel project with `TRANSPORT=http`, or alongside the existing Hermes/API Vault Bridge services). Whatever host is chosen, keep it off the same deploy pipeline as the static dashboard so a bad push to this server can never break `copress-dashboard.vercel.app`.
