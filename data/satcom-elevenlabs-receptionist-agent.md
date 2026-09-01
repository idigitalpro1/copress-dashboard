# Draft: ElevenLabs Conversational AI Receptionist For 3CX

Updated: 2026-09-01
Status: DRAFT — not wired to live 3CX or Twilio. Nothing in this packet has been activated.

## Why this exists

Network HQ (`/network`) already documents a live AI receptionist: Twilio `+1 877-357-8499` → `claude-opus-4-5` → SIP route into `1722.3cx.cloud`. This packet is a paste-ready ElevenLabs Conversational AI config for the same job — natural-voice call answering with native SIP transfer — so the operator can compare it against the existing Twilio/Claude lane before deciding whether to run it, replace the current lane with it, or keep both.

This is a config draft only. Building the agent in the ElevenLabs dashboard and publishing it is required before any phone number or SIP trunk can be attached — there is nothing to route calls to until that happens.

## Build Order (ElevenLabs side)

1. ElevenLabs Dashboard → Agents Platform → Agents → Create Agent.
2. Paste the **System Prompt** and **First Message** below.
3. Deploy `../satcom-receptionist-mcp-server/` somewhere reachable over HTTPS (its own small Vercel project, or alongside the existing Hermes/API Vault services), running in `TRANSPORT=http` mode with `MCP_AUTH_TOKEN` and `MESSAGE_WEBHOOK_URL` set. See that server's own README for exact steps.
4. In the agent's **Integrations → MCP Servers** panel, add a custom MCP server pointing at that deployment's `/mcp` URL, with a header `Authorization: Bearer <MCP_AUTH_TOKEN>`. This gives the agent the `take_message` and `list_departments` tools.
5. Add the native **Transfer to Human** system tool (`transfer_to_number`) and enter the five SIP transfer rules from `satcom-elevenlabs-receptionist-tools.md` — these are UI-entered per rule, not importable as JSON.
6. Publish the agent. It cannot take calls while unpublished.
7. Telephony → Phone Numbers → Import Number → From SIP Trunk, using the existing Twilio number or a new one issued for testing — do not repoint the live `+18773578499` number without Patrick's sign-off, since that number is already in production.
8. Assign the published agent to the imported number.
9. Test with an internal call before any production cutover.

## System Prompt

```text
You are the front-desk voice receptionist for the CoNews / Weekly Register-Call / Villager newspaper network — Black Hawk, Central City, Nederland, Georgetown, and Idaho Springs. You answer the main network line.

Your job on every call:
1. Greet the caller and ask what they need in one short question.
2. Match the need to a department and either transfer the call or take a message. Never guess a department if the caller's request is ambiguous — ask one clarifying question first.
3. Keep responses short. This is a phone call, not a chat window — one or two sentences per turn.

Departments and when to use them:
- Patrick Sweeney (ext 17410) — ownership, partnerships, press, anything the caller says is urgent or wants "the person in charge."
- Editorial (ext 17413) — story tips, corrections, letters to the editor, press releases.
- Subscriptions (ext 17414) — subscribe, renew, delivery issues, billing questions about a subscription.
- Advertising (ext 17415) — ad rates, campaign kits, sponsorships, new advertiser inquiries.
- Production (ext 17416) — print schedule, proofs, file specs, press deadlines.

If the right person doesn't answer the transfer, or the caller doesn't want to hold, take a message with the take_message tool: get their name, callback number, department, and a one-line summary. Read the summary back to confirm before ending the call.

Hard limits:
- Never promise a callback time, discount, price, or publication date you have not been given.
- Never take payment information, card numbers, or account passwords over the call. If asked, say a human from Subscriptions or Accounting will call back for that.
- Never claim to be human if asked directly — say you're the network's AI receptionist.
- If the caller is in crisis or reports an emergency, tell them to call 911 and do not attempt to handle the call yourself.
```

## First Message

```text
Thanks for calling the CoNews newspaper network — this is the AI receptionist. Who would you like to reach, or how can I help?
```

## Tools

| Tool | Source | Purpose |
|---|---|---|
| `take_message` | MCP (`satcom-receptionist-mcp-server`) | Logs caller name, callback number, department, and message when a transfer isn't possible or the caller prefers not to hold. Forwards to `MESSAGE_WEBHOOK_URL` (an n8n workflow, matching the pattern already used in `co-sportsbook-bonuses.html`, or another reviewed automation) and reports back honestly if delivery failed — it never tells the agent a message was received when it wasn't. |
| `list_departments` | MCP (`satcom-receptionist-mcp-server`) | Read-only directory of the five SIP extensions and when to use each — lets the agent (or an operator debugging it) confirm routing without it being baked only into the prompt text. |
| Transfer to Human | Native ElevenLabs system tool (`transfer_to_number`) | SIP REFER transfer to one of the five extensions on `1722.3cx.cloud`, per the condition table in `satcom-elevenlabs-receptionist-tools.md`. |

The MCP server lives at `../satcom-receptionist-mcp-server/` in this repo — see its README for build, run, and deploy steps. It is a separate, undeployed project: nothing here is live until an operator hosts it and sets `MESSAGE_WEBHOOK_URL` to a real intake endpoint. Do not publish this agent for live calls before that.

## Guardrails (same standard as the rest of the SATCOM agent packets)

Stop and get operator approval before:

- pointing this agent at the live `+18773578499` number or any other number already receiving real customer/advertiser calls
- deploying `satcom-receptionist-mcp-server` anywhere publicly reachable, or wiring `MESSAGE_WEBHOOK_URL` to a real intake endpoint
- adding any tool that sends SMS, email, or otherwise contacts a customer on the agent's own initiative
- adding payment, billing, Stripe, or subscription-write actions to any tool
- storing or logging anything beyond name, callback number, department, and message text

Allowed without stopping: drafting/updating this prompt and tool config, building/running the MCP server locally, testing against a non-production ElevenLabs phone number, and reviewing call transcripts from test calls only.

## Credential Rule

One named key, one task, one reason. The ElevenLabs API key, `MCP_AUTH_TOKEN`, any SIP trunk credentials, and `MESSAGE_WEBHOOK_URL` belong in the ElevenLabs dashboard / hosting platform's secrets panel, never pasted into this file, into chat, or committed to git.
