# CoNews / SATCOM Deploy Hooks

Status: active deploy checklist
Generated: 2026-05-14
Target dashboard: `copress-dashboard`
Local repo: `/Users/Ace/Codex/apps/copress-dashboard`
Production URL: `https://copress-dashboard.vercel.app/`

## Hook Boundaries

Allowed:
- static dashboard files
- dashboard `data/conews-*` files
- Vercel dashboard deploy
- production smoke checks
- progress log updates

Forbidden:
- DNS
- Plesk
- `.env`
- secrets
- customer/subscriber data
- Sendy
- PDF pipeline
- production database mutation

## Pre-Deploy Hook

Run from `/Users/Ace/Codex/apps/copress-dashboard`:

```bash
git status --short
git diff --check
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('data/conews-town-rollout.json','utf8')); JSON.parse(fs.readFileSync('data/conews-shoplocal-schema.json','utf8')); JSON.parse(fs.readFileSync('data/conews-next-sprint-kanban.json','utf8')); JSON.parse(fs.readFileSync('data/conews-seo-pillar-templates.json','utf8')); console.log('json ok')"
python3 -m http.server 4177 --bind 127.0.0.1
```

In another terminal while the server is running:

```bash
curl -I --max-time 5 http://127.0.0.1:4177/network.html
for f in \
  data/conews-town-rollout.json \
  data/conews-shoplocal-schema.json \
  data/conews-shoplocal-schema.csv \
  data/conews-next-sprint-kanban.json \
  data/conews-seo-pillar-templates.json \
  data/conews-seo-pillar-templates.csv \
  data/conews-seo-pillar-templates.md \
  data/conews-architecture-optimization.md \
  data/conews-satcom-handoff-summary.md; do
  curl -s -o /dev/null -w "%{http_code} $f\n" --max-time 5 "http://127.0.0.1:4177/$f"
done
```

## Deploy Hook

Deploy with Vercel from `/Users/Ace/Codex/apps/copress-dashboard`:

```bash
vercel deploy --prod
```

GitHub push/PR is separate. If GitHub auth is expired, Vercel deploy may still work from local source, but the branch must be pushed later as the review/recovery record.

## Post-Deploy Hook

```bash
curl -I --max-time 10 https://copress-dashboard.vercel.app/network
for f in \
  data/conews-town-rollout.json \
  data/conews-shoplocal-schema.json \
  data/conews-shoplocal-schema.csv \
  data/conews-next-sprint-kanban.json \
  data/conews-seo-pillar-templates.json \
  data/conews-seo-pillar-templates.csv \
  data/conews-seo-pillar-templates.md \
  data/conews-architecture-optimization.md \
  data/conews-satcom-handoff-summary.md; do
  curl -s -o /dev/null -w "%{http_code} $f\n" --max-time 10 "https://copress-dashboard.vercel.app/$f"
done
```

Expected:
- `/network` returns 200 or Vercel 308/200 clean URL behavior.
- all `data/conews-*` files return 200.
- no GitHub/Linear/MCP auth is required for the static deploy itself.

## Progress Hook Format

Append to:
`/Users/Ace/workspace/02_Output/hermes_conews_progress.md`

```text
## YYYY-MM-DD HH:MM - Deploy Hook
- Changed:
- Decisions:
- Blockers:
- Next:
- Files proposed or created:
- Deploy URL:
- Smoke:
```
