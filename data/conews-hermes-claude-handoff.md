# Hermes / Claude Shared Handoff

Last updated: 2026-05-14

## Current Goal

Run SATCOM / CoPress / Hermes as one operator stack with a clean shared handoff between Claude, Codex, and Hermes/Aileen.

## Roles

- Claude: repo execution, patches, commits, deploys.
- Codex: review, task execution, debugging, repo support.
- Hermes / Aileen: local agent UI, operator chat, local model routing.
- SATCOM: main admin dashboard.
- SATCO Academy: staff training and Daily Quick.
- Colorado News Press: publishing, stationery, upload, and editorial handoff brand.
- 5Star Companies: parent brand element shared across properties.

## Current Local URLs

- Hermes WebUI / Aileen: `http://127.0.0.1:8787`
- Hermes dashboard: `http://127.0.0.1:9119/sessions`
- SATCOM dashboard live: `https://copress-dashboard.vercel.app/`
- Kanban: `http://127.0.0.1:8096`
- Hermes Crew bridge: `http://127.0.0.1:8793/health`
- Microsoft 365 admin users: `https://admin.microsoft.com/Adminportal/Home#/users`

## Recent CoPress Dashboard Commit

`8e4bede feat: add SATCOM brand and M365 launcher`

Changes included:

- Command Center visible title changed to SATCOM.
- Staff Academy branded as SATCO Academy.
- SATCO Daily Quick added to learning surface.
- NationalIntelligence.com brand reference added to Docs Hub.
- Microsoft 365 Login launcher added for staff mailbox and alias work.

## Current CoNews / SATCOM Rollout State

Branch:
`/Users/Ace/Codex/apps/copress-dashboard` on `codex/conews-rollout-board`

Local commits:

- `0e2fbc7 feat(satcom): add conews rollout ownership board`
- `98589bc feat(data): add conews town rollout source`
- `9290201 feat(shoplocal): add directory schema source`
- `2181631 feat(hermes): add conews deploy hooks packet`

Production deploy:

- Vercel deployment: `dpl_DrTt41C7Bwn9XvAJaG4Vx4oQTA9e`
- Production alias: `https://copress-dashboard.vercel.app`
- Smoke checked: `/network` returned `200`
- Smoke checked data files:
  - `/data/conews-town-rollout.json`
  - `/data/conews-shoplocal-schema.json`
  - `/data/conews-shoplocal-schema.csv`
  - `/data/conews-next-sprint-kanban.json`
  - `/data/conews-architecture-optimization.md`
  - `/data/conews-satcom-handoff-summary.md`
  - `/data/conews-hermes-command-packet.md`
  - `/data/conews-deploy-hooks.md`

GitHub push is still blocked by expired `idigitalpro1` GitHub auth. Vercel deploy is live from local source under the authenticated `aiace` Vercel account.

## Hermes 50-Agent Planning Lane

Hermes/Aileen may coordinate up to 50 planning subagents for CoNews.Press buildout, but only in file-output/suggest-mode.

Rules:

- Use batches of 5 to 10 active agents.
- Write agent outputs under `/Users/Ace/workspace/02_Output/conews_buildout/agents/`.
- Append status to `/Users/Ace/workspace/02_Output/hermes_conews_progress.md`.
- Do not edit repo source, deploy, mutate production data, touch DNS/Plesk, modify `.env`, touch secrets, rebuild Sendy, or rebuild the PDF pipeline.
- Codex/Claude remain responsible for reviewed repo edits, commits, deploys, and live verification.

Primary command packet:
`/Users/Ace/workspace/02_Output/07_hermes_conews_buildout_command_packet.md`

Deploy hooks:
`/Users/Ace/workspace/02_Output/conews_buildout/deploy_hooks.md`

## Hermes / Aileen Current State

Hermes WebUI provider routing was stabilized on 2026-05-14.

- Default model: `hermes3-8b`
- Provider: `custom`
- Local endpoint: Ollama-compatible local route
- Qwen reintroduced only as safe local alias: `qwen36-35b-a3b`
- Raw `qwen3.6:35b-a3b` should not be selected in WebUI because it can trigger provider-key parsing.

Host configs touched during triage:

- `/Users/Ace/.hermes/webui-home/config.yaml`
- `/Users/Ace/.hermes/webui-home/webui/config.yaml`
- `/Users/Ace/.hermes/webui-home/webui/models_cache.json`
- `/Users/Ace/.hermes/webui/config.yaml`
- `/Users/Ace/.hermes/webui/models_cache.json`
- `/Users/Ace/.hermes/profiles/qwen/config.yaml`

Current best KISS direction:

- Keep `hermes3-8b` as the default stable lane.
- Use `qwen36-35b-a3b` only when heavy planning/curation/vision is useful.
- Keep Hermes in planning/suggest-mode unless Codex/Claude is explicitly executing the reviewed repo/deploy path.

Known local models:

- `hermes3:8b`
- `hermes3:70b`
- `qwen3.6:35b-a3b` raw Ollama tag
- `qwen36-35b-a3b` safe WebUI alias

## Useful Commands

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | egrep "hermes|8787|9119|8793|8096"
curl -sS http://127.0.0.1:8787/api/settings | python3 -m json.tool
curl -sS http://127.0.0.1:8787/api/models | python3 -m json.tool | sed -n '1,80p'
docker logs --tail=120 hermes-webui-manual
tail -80 /Users/Ace/workspace/02_Output/hermes_conews_progress.md
curl -I --max-time 10 https://copress-dashboard.vercel.app/network
```

## Do Not Touch

- secrets
- `.env` files
- private keys
- customer data
- Sendy rebuild
- PDF pipeline rebuild
- dirty parent repo bulk files
- untracked runtime folders unless explicitly requested

## First Prompt For Claude Or Hermes

```text
Read /Users/Ace/Codex/HERMES_CLAUDE_HANDOFF.md first. Use it as current context. Keep changes minimal and do not touch secrets.
```
