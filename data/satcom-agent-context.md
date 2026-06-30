# SATCOM Agent Context Packet

Updated: 2026-06-30

Use this packet when Hermes, Open WebUI, or another local agent cannot read `/Users/Ace/Codex/apps/copress-dashboard` directly. SATCOM should be the URL-first source of truth, with local paths used only when the host folder is mounted.

## Start Here

Public manifest:
`https://satcom.5280.menu/data/satcom-agent-context.json`

Paste-ready prompt:
`https://satcom.5280.menu/data/satcom-hermes-openwebui-prompt.md`

Docs hub:
`https://satcom.5280.menu/docs`

API Vault reference:
`https://satcom.5280.menu/apistore`

Fallback static host:
`https://copress-dashboard.vercel.app`

Local repo fallback:
`/Users/Ace/Codex/apps/copress-dashboard`

## What Hermes / Open WebUI Should Do

1. Read the manifest and prompt above.
2. Load the source docs listed below.
3. Work in docs-first suggest-mode unless the operator explicitly approves execution.
4. Generate plans, review packets, prompt packets, markdown, JSON, CSV, and static campaign-kit artifacts.
5. Stop and ask for operator/Codex approval before any hard review hook.

## Source Docs In Order

| Purpose | Public URL | Local fallback |
|---|---|---|
| Agent context | `https://satcom.5280.menu/data/satcom-agent-context.md` | `/Users/Ace/Codex/apps/copress-dashboard/data/satcom-agent-context.md` |
| Hermes/Open WebUI prompt | `https://satcom.5280.menu/data/satcom-hermes-openwebui-prompt.md` | `/Users/Ace/Codex/apps/copress-dashboard/data/satcom-hermes-openwebui-prompt.md` |
| Annual PCI readiness report | `https://satcom.5280.menu/data/pci-annual-compliance-report-2026.md` | `/Users/Ace/Codex/apps/copress-dashboard/data/pci-annual-compliance-report-2026.md` |
| Hermes command packet | `https://satcom.5280.menu/data/conews-hermes-command-packet.md` | `/Users/Ace/Codex/apps/copress-dashboard/data/conews-hermes-command-packet.md` |
| Hermes execution policy | `https://satcom.5280.menu/data/conews-hermes-execution-policy.md` | `/Users/Ace/Codex/apps/copress-dashboard/data/conews-hermes-execution-policy.md` |
| Hermes / Claude handoff | `https://satcom.5280.menu/data/conews-hermes-claude-handoff.md` | `/Users/Ace/Codex/apps/copress-dashboard/data/conews-hermes-claude-handoff.md` |
| SATCOM handoff summary | `https://satcom.5280.menu/data/conews-satcom-handoff-summary.md` | `/Users/Ace/Codex/apps/copress-dashboard/data/conews-satcom-handoff-summary.md` |
| SATCOM progress monitor | `https://satcom.5280.menu/data/conews-satcom-progress-monitor.md` | `/Users/Ace/Codex/apps/copress-dashboard/data/conews-satcom-progress-monitor.md` |
| Deploy hooks | `https://satcom.5280.menu/data/conews-deploy-hooks.md` | `/Users/Ace/Codex/apps/copress-dashboard/data/conews-deploy-hooks.md` |
| Kit generator prompt | `https://satcom.5280.menu/_kit-template/HERMES-KIT-PROMPT.md` | `/Users/Ace/Codex/apps/copress-dashboard/_kit-template/HERMES-KIT-PROMPT.md` |

## Local Endpoint Map

| Endpoint | URL | Use |
|---|---|---|
| Open WebUI Login | `http://127.0.0.1:8093/auth` | Local Open WebUI login for Hermes Kit Build Mode, model selection, file upload, and knowledge-base management |
| Hermes Codex knowledge base | `http://127.0.0.1:8093/workspace/knowledge/7c336629-c94b-468c-b7fc-37affea32728` | Open WebUI knowledge base loaded with curated SATCOM/Hermes docs |
| Aileen / Hermes WebUI | `http://127.0.0.1:8787/` | Human operator dashboard for prompts, chat continuity, and local model routing |
| Hermes diagnostics | `http://127.0.0.1:9119/sessions` | Sessions, analytics, models, logs, skills, plugins, profiles, config, and keys |
| Hermes Crew bridge | `http://127.0.0.1:8793/health` | Local crew run/status/result API |
| OpenAI-compatible local gateway | `http://127.0.0.1:8642/v1` | Open WebUI/API base URL for local model clients |
| Kanban Ops | `http://127.0.0.1:8096` | Local board for operator work |
| API Vault Bridge (macOS) | `http://127.0.0.1:3579/health` | Local guarded one-key request bridge; never bulk export |
| API Vault Bridge (Open WebUI Docker) | `http://host.docker.internal:3579` | Use as the Open WebUI tool base URL for API Vault requests |

Direct diagnostics API calls may return `401 Unauthorized` without the dashboard session token. That does not prove Hermes is down. The Open WebUI knowledge-base URL requires the local Open WebUI login session.

## Open WebUI Setup

Create or update a knowledge collection named `SATCOM Ops`.

Minimum URL set:

```text
https://satcom.5280.menu/data/satcom-agent-context.md
https://satcom.5280.menu/data/satcom-hermes-openwebui-prompt.md
https://satcom.5280.menu/data/satcom-agent-context.json
```

If Open WebUI cannot import URLs, paste the prompt file into the chat and add the manifest URL as the source note. If the Docker container can reach the Mac host but not `/Users/Ace`, use the public SATCOM URLs.

## Hermes Setup

Paste the prompt from:
`https://satcom.5280.menu/data/satcom-hermes-openwebui-prompt.md`

Before using MCP handoff, run:

```bash
~/bin/mcp-status
curl -sS http://127.0.0.1:3579/health
```

If MCP is not green, keep Hermes in docs-first suggest-mode and let Codex/operator execute reviewed changes.

## Hard Review Hooks

Stop before:

- secrets, tokens, private keys, `.env`, or credential handling
- customer/subscriber data or private CSVs
- DNS, Plesk, SSL, firewall, or domain changes
- Sendy, live email sends, 3CX live SMS/voice, or external contact
- billing, Stripe, bank, invoice, subscription, or Microsoft 365 account changes
- production deploys unless explicitly approved by the operator
- destructive filesystem or git operations

## Allowed Without Stopping

- static packet generation
- markdown, JSON, CSV, and dashboard data artifacts
- local read-only checks
- local static route checks
- non-secret prompt packets
- SATCOM planning links
- file-based progress updates

## Credential Rule

One named key, one task, one reason. Never bulk export credentials to Hermes, Open WebUI, prompts, Git, browser session config, or model config.
