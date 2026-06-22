# SATCOM Handoff Summary: CoNews.Press Buildout

Status: Ready for Codex/Claude review
Generated: 2026-05-14

## 2026-06-21 SATCOM Credential Update

SATCOM card and documentation language now follows the canonical AI credential runbook:

- Google/Aiace runtime calls use `GOOGLE_AGENT_API_KEY` from local or deployed environment variables.
- API Vault is browser-local operator storage only. It is useful for named-key reference and reviewed handoff, not as the production source of truth.
- Hermes/Aileen credential handling is one service key, one task, one reason. Bulk "all keys" export is not an agent workflow.
- Legacy service-account JSON and SATCOM token-minting paths are advanced/legacy lanes unless a newer operator-approved runbook reintroduces them.

## Executive Summary

The CoNews.Press buildout should proceed as an 8-site rollout with Morrison/Red Rocks and Nederland as pilots, followed by the Black Hawk/Central City revenue pair, Idaho Springs/Georgetown outdoor pair, and Evergreen/Golden scale pair.

Hermes/Aileen remains the planning and packet-generation lane. Codex/Claude should handle reviewed implementation, repo edits, commits, deploys, and production verification.

## Buildout Packets

- `/Users/Ace/workspace/02_Output/conews_buildout/city_rollout_matrix.md`
- `/Users/Ace/workspace/02_Output/conews_buildout/shoplocal_rollout_packet.md`
- `/Users/Ace/workspace/02_Output/conews_buildout/news_sections_seo_packet.md`
- `/Users/Ace/workspace/02_Output/conews_buildout/campaign_kits_packet.md`
- `/Users/Ace/workspace/02_Output/conews_buildout/next_sprint_kanban.csv`
- `/Users/Ace/workspace/02_Output/conews_buildout/next_sprint_kanban.json`

## Recommended Next Implementation PRs

1. `feat(satcom): add conews rollout ownership board`
2. `feat(shoplocal): add directory schema and sponsor tiers`
3. `feat(editorial): add town SEO pillar templates`
4. `feat(contributors): add upload/onboarding entry points`
5. `feat(weekly): add digital edition build prototype`

## Execution Boundaries

Allowed after review:
- dashboard cards
- static planning pages
- JSON/CSV issue imports
- town landing templates
- non-secret onboarding copy

Forbidden unless explicitly approved:
- DNS
- Plesk
- live email sends
- subscriber import
- secret links
- `.env`
- Sendy
- PDF pipeline
- customer data

## Progress Hooks

File-based progress is active:
`/Users/Ace/workspace/02_Output/hermes_conews_progress.md`

MCP hooks are not green yet. Use `~/bin/mcp-status` before relying on Hermes tool handoff.

## First Codex Task

Review the generated packets and decide whether the first visible app change should be:

1. SATCOM ownership board cards with thumbnails and phase/status fields.
2. CoNews.Press homepage structure and town card data.
3. Shop Local schema export and admin intake fields.

Recommended: start with SATCOM ownership board cards so tonight's presentation has visible progress before deeper app wiring.


## Architecture Optimization Added

Optimized architecture packet:
`/Users/Ace/workspace/02_Output/conews_buildout/architecture_optimization.md`

Optimized PR sequence:
`/Users/Ace/workspace/02_Output/conews_buildout/optimized_pr_sequence.csv`

Key decision: build the SATCOM ownership board first, then shared metadata, then Shop Local schema, SEO templates, weekly edition renderer, intake CTAs, and finally MCP monitoring repair as its own infrastructure task.
