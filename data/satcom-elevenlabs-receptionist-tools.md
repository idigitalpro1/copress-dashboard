# Tool Config Reference: SATCOM ElevenLabs Receptionist

Updated: 2026-09-01
Status: DRAFT — reference for manual entry into the ElevenLabs dashboard. Nothing here has been activated.

Companion to `satcom-elevenlabs-receptionist-agent.md`. That file covers the system prompt and build order; this one covers the two tool sources in detail.

## 1. MCP Tools (`take_message`, `list_departments`)

Source: `../satcom-receptionist-mcp-server/`. These are not entered as JSON in the ElevenLabs dashboard — they come from adding the deployed server as a custom MCP server:

1. ElevenLabs Dashboard → Agent → **Integrations → MCP Servers → Add Custom MCP Server**.
2. **Server URL**: `https://<wherever-it-is-hosted>/mcp` (streamable HTTP endpoint — see the server's README for hosting options).
3. **Header**: `Authorization: Bearer <MCP_AUTH_TOKEN>` — same secret the server was started with.
4. **Tool approval**: require approval / review while testing; only relax to auto-approve once test calls confirm `take_message` behaves correctly, including the failure path when `MESSAGE_WEBHOOK_URL` isn't delivering.
5. The agent will then see `take_message` and `list_departments` exactly as described in each tool's own description string (see `satcom-receptionist-mcp-server/src/tools/`).

Do not point the agent at a locally-running (`localhost`) instance of the server — ElevenLabs calls it over the public internet, so it has to be actually deployed somewhere reachable first.

## 2. Transfer to Human (`transfer_to_number`)

Native ElevenLabs system tool — not an MCP or webhook tool. Add it via **Agent → Add Tool → System → Transfer to Human**, then enter one rule per row below. All five point at the same SIP host, `1722.3cx.cloud`, used by the existing Twilio/Claude receptionist described in the root `README.md`.

| Condition (natural language, entered as-is) | Number Type | Target | Transfer Type |
|---|---|---|---|
| Caller wants Patrick Sweeney, ownership, partnerships, press, or says it's urgent / wants "the person in charge" | SIP URI | `sip:17410@1722.3cx.cloud` | SIP REFER |
| Caller has a story tip, correction, letter to the editor, or press release | SIP URI | `sip:17413@1722.3cx.cloud` | SIP REFER |
| Caller wants to subscribe, renew, report a delivery issue, or ask about subscription billing | SIP URI | `sip:17414@1722.3cx.cloud` | SIP REFER |
| Caller is asking about ad rates, campaign kits, sponsorships, or is a new advertiser | SIP URI | `sip:17415@1722.3cx.cloud` | SIP REFER |
| Caller has a print-schedule, proof, file-spec, or deadline question | SIP URI | `sip:17416@1722.3cx.cloud` | SIP REFER |

Use **SIP REFER** (not Conference or Blind) so the transfer hands off cleanly to 3CX rather than keeping the ElevenLabs leg bridged on the call.

If no rule matches and the caller doesn't want to hold, fall through to `take_message` instead of guessing a transfer — this matches the system prompt's instruction not to guess a department.

## Keeping This In Sync

The extension list is duplicated in three places by necessity: `README.md` ("3CX SIP Extensions"), `network.html` (the 3CX Phone System card), and `satcom-receptionist-mcp-server/src/constants.ts` (which is what `list_departments` actually returns, and what this table was generated from). If an extension changes, update all three — this table and the system prompt's department list should be regenerated from `constants.ts`, not edited independently.
