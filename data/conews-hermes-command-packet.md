# Hermes Command Packet: CoNews.Press Buildout

Date: 2026-05-14
Operator: Ace
Runtime target: Hermes / Aileen at `http://127.0.0.1:8786`
Repo root: `/Users/Ace/Codex`

## Current Hook Status

`~/bin/mcp-status` is currently green for local and edge MCP hooks. Hermes may use guarded MCP handoff for status and reviewed requests, while Codex/Claude still own repo edits, commits, deploys, and production verification.

Do not use raw destructive actions. Do not deploy. Do not modify DNS, Plesk, secrets, `.env`, Sendy, PDF pipeline, customer data, or dirty/untracked repo files.

## 50 Subagent Allowance

Hermes may coordinate up to 50 planning subagents for this CoNews buildout, but they must remain in file-output/suggest-mode.

Rules:

- Maximum subagents: 50.
- Recommended active batch: 5 to 10 at a time so the Mac stays responsive.
- Subagents may read the approved source docs and write planning outputs only under `/Users/Ace/workspace/02_Output/conews_buildout/agents/`.
- Subagents may not edit repo source, deploy, run DNS/Plesk changes, modify `.env`, touch secrets, mutate customer data, rebuild Sendy, or rebuild the PDF pipeline.
- Each subagent must append a status block to `/Users/Ace/workspace/02_Output/hermes_conews_progress.md`.
- Any implementation request must be turned into a Codex/Claude handoff with allowed files, forbidden files, validation commands, and rollback notes.

Suggested crews:

1. City SEO agents, 8 agents, one per rollout site.
2. Shop Local agents, 8 agents, one seed list/category plan per site.
3. Editorial agents, 8 agents, first issue packages per site.
4. Campaign kit agents, 6 agents, advertiser/contributor/photo/town partner kits.
5. QA/compliance agents, 5 agents, sponsored-label, source, schema, accessibility, and privacy checks.
6. SATCOM agents, 5 agents, board cards, thumbnails, blockers, next actions, Linear cards.
7. Research agents, 5 agents, meeting calendars, school/sports sources, event/outfitter sources.
8. Reserve agents, 5 agents, only if a blocker needs a focused packet.

## Paste This Into Hermes

```text
Read this first:
/Users/Ace/workspace/02_Output/07_hermes_conews_buildout_command_packet.md

You are Aileen/Hermes working as the local operator planning lane for CoNews.Press.

Mission:
Continue the CoNews.Press buildout plan across city sites, news sections, Shop Local, SEO, campaign kits, and SATCOM handoff artifacts.

Hard boundaries:
- Work in planning/suggest-mode only until Codex or Claude reviews a diff.
- Do not deploy.
- Do not edit DNS, Plesk, secrets, .env files, Sendy, PDF pipeline, customer/subscriber data, or dirty/untracked repo files.
- Do not assume 5280.menu and conews.press are interchangeable. Treat 5280.menu as public canonical for that property, and conews.press as the operating/network identity unless docs say otherwise.
- Preserve Codex independence: Hermes creates plans, issues, packets, progress logs, and safe handoff prompts. Codex/Claude perform repo execution, patches, commits, PRs, and production verification.
- You may coordinate up to 50 planning subagents, in batches of 5 to 10. Every subagent must write outputs under `/Users/Ace/workspace/02_Output/conews_buildout/agents/` and append progress to `/Users/Ace/workspace/02_Output/hermes_conews_progress.md`.

Use these source docs first:
1. /Users/Ace/Codex/AGENTS.md
2. /Users/Ace/Codex/docs/SOURCE_OF_TRUTH.md
3. /Users/Ace/Codex/docs/SYSTEM_RECOVERY_MAP.md
4. /Users/Ace/Codex/HERMES_CLAUDE_HANDOFF.md
5. /Users/Ace/workspace/02_Output/01_register_call_editorial_blueprint.md
6. /Users/Ace/workspace/02_Output/02_author_workpackets.md
7. /Users/Ace/workspace/02_Output/03_sponsor_spec.md
8. /Users/Ace/workspace/02_Output/05_digital_weekly_delivery_engine.md
9. /Users/Ace/workspace/02_Output/06_conews_press_homepage_structure.md

Progress hook:
After every completed phase, append a short status block to:
/Users/Ace/workspace/02_Output/hermes_conews_progress.md

Status block format:
## YYYY-MM-DD HH:MM - Phase Name
- Changed:
- Decisions:
- Blockers:
- Next:
- Files proposed or created:

Primary deliverables:
1. Create or update a city-site rollout matrix for the first 8 city/town sites.
2. Create a Shop Local rollout packet with categories, sponsor tiers, and directory fields.
3. Create a News Sections SEO packet with pillar URLs, internal-link rules, and article templates.
4. Create campaign kit packets for advertiser onboarding and contributor onboarding.
5. Create a SATCOM handoff summary that Codex/Claude can turn into implementation tickets.
6. Create a Linear/Kanban-ready issue export for the next sprint.
7. Create agent packet summaries from the 50-subagent planning lane.

Output location:
Write planning outputs under:
/Users/Ace/workspace/02_Output/conews_buildout/

Use simple filenames:
- city_rollout_matrix.md
- shoplocal_rollout_packet.md
- news_sections_seo_packet.md
- campaign_kits_packet.md
- satcom_handoff_summary.md
- next_sprint_kanban.csv
- next_sprint_kanban.json
- agents/<agent-id>-<topic>.md

Monitoring:
Before and after each phase, report:
- Current phase
- File(s) touched or proposed
- Any blocker
- Whether MCP hooks are green or still unavailable

If you need execution beyond planning, stop and hand Codex/Claude a precise implementation request with allowed files, forbidden files, validation commands, and rollback notes.
```

## Deploy Hook Packet

Deploy/run hooks live here:

`/Users/Ace/workspace/02_Output/conews_buildout/deploy_hooks.md`

Use them as the operator checklist before and after deploy. Hermes may monitor the file progress hook, but Codex/Claude owns the deploy command and production verification.

## Local Operator Commands

Run these from Terminal when you want a quick progress and health snapshot:

```bash
cd /Users/Ace/Codex
echo "=== TIME ==="
date
echo
echo "=== GIT ==="
git status --short
echo
echo "=== HERMES WEBUI ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | egrep "hermes|8786|9119|8793|NAMES"
curl -sS --max-time 5 http://127.0.0.1:8786/api/settings | python3 -m json.tool | sed -n '1,80p'
echo
echo "=== MCP HOOKS ==="
~/bin/mcp-status
echo
echo "=== BUILDOUT OUTPUT ==="
find /Users/Ace/workspace/02_Output/conews_buildout -maxdepth 1 -type f -print 2>/dev/null | sort
echo
echo "=== PROGRESS LOG TAIL ==="
tail -80 /Users/Ace/workspace/02_Output/hermes_conews_progress.md 2>/dev/null || true
```

## MCP Hook Gate

Only let Hermes use MCP action handoff after this is green:

```bash
~/bin/mcp-status
```

Expected before MCP handoff:
- `ops-mcp` local is OK
- `mcp.conews.press` edge is OK if remote bridge is needed
- Hermes Crew bridge is running if `/ops/tools` and `/ops/call` are required

If MCP is not green, keep Hermes in docs-first planning mode and let Codex/Claude execute.

## Next Codex/Claude Implementation Request Template

```text
From /Users/Ace/Codex, review the Hermes buildout packet at:
/Users/Ace/workspace/02_Output/conews_buildout/satcom_handoff_summary.md

Implement only the reviewed ticket(s).
Allowed files:
- [fill in exact paths]

Forbidden:
- .env, secrets, keys, Sendy, processPdf.py, customer data, untracked runtime folders, DNS, Plesk.

Before edits:
- git status --short
- show proposed diff scope

After edits:
- git diff --check
- relevant build/test/smoke command
- do not commit until reviewed
```
