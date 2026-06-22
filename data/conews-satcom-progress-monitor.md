# SATCOM Progress Monitor Packet

Status: operator-console-refresh
Generated: 2026-06-21
Dashboard: `https://satcom.5280.menu/`

## Current Sprint State

| Issue | Status | Evidence |
|---|---|---|
| PROV-501 | deployed | SATCOM ownership board cards |
| PROV-502 | deployed | town rollout JSON |
| PROV-503 | deployed | Shop Local schema JSON/CSV |
| PROV-504 | deployed | SEO pillar template JSON/CSV/MD |
| PROV-505 | deployed | contributor onboarding CTA JSON/CSV/MD |
| PROV-506 | deployed | advertiser campaign kit JSON/CSV/MD |
| PROV-507 | deployed | weekly edition sample JSON/MD |
| PROV-508 | refreshed | SATCOM progress monitor plus API Vault/Aiace card language |

## Active Blockers

- Linear live issue sync still requires current connector/auth verification before treating the board as canonical.
- API Vault is browser-local operator storage only; production Google/Aiace calls must read `GOOGLE_AGENT_API_KEY` from local or deployed env.
- 3CX runtime configuration remains external to the static SATCOM dashboard.
- Run `~/bin/mcp-status` before relying on Hermes/MCP action handoff.

## Restore Points

- `fb975c5` Hermes kanban execution packet
- `0b0c4f9` SEO pillar templates
- `e8447c7` contributor onboarding CTA
- `fd3f706` final sprint artifacts

## Latest Deploy

- URL: `https://satcom.5280.menu/`
- Latest deployment: see Vercel dashboard for the current production deployment ID.
- Expected smoke: `/`, `/#admin`, `/docs`, and `/apistore` all return 200 after deployment.

## AI Credential Lane

Canonical runbook:
`/Users/Ace/Codex/docs/AI_CREDENTIALS_AND_VAULT_RUNBOOK.md`

Active rule:
`GOOGLE_AGENT_API_KEY` is the preferred Google/Aiace runtime credential. It belongs in local or deployed env, never in Git and never pasted into prompts.

API Vault:
browser-local operator storage only. It can help identify a named key for a reviewed handoff, but it is not the production source of truth and it is not an agent bulk-export surface.

## Progress Log

Canonical local log:
`/Users/Ace/workspace/02_Output/hermes_conews_progress.md`

Dashboard mirror:
`/data/conews-satcom-progress-monitor.md`

## Next Choices

1. Set `GOOGLE_AGENT_API_KEY` only in local/deployed env for apps that call Google/Aiace.
2. Use API Vault for operator-local named-key reference and handoff, never bulk agent export.
3. Run a SATCOM smoke check after deployment: `/`, `/#admin`, `/docs`, `/apistore`.
