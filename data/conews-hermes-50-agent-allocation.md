# Hermes 50-Agent Linear/Kanban Allocation

Generated: 2026-05-14
Source: `/Users/Ace/workspace/02_Output/conews_buildout/next_sprint_kanban.json`
Mode: Hermes/Aileen planning lane only

## Safety Mode

Hermes may coordinate these agents as planning/output workers only. They write packets under:

`/Users/Ace/workspace/02_Output/conews_buildout/agents/`

They do not edit repo source, deploy, run DNS/Plesk changes, touch secrets, mutate customer data, rebuild Sendy, or rebuild the PDF pipeline.

Codex/Claude owns implementation, commits, Vercel deploys, and production verification.

## Kanban Source

| Issue | Purpose | Current State |
|---|---|---|
| `PROV-501` | SATCOM ownership board | locally implemented and deployed |
| `PROV-502` | town rollout data source | locally implemented and deployed |
| `PROV-503` | Shop Local schema export | locally implemented and deployed |
| `PROV-504` | SEO pillar templates | locally implemented and deployed candidate |
| `PROV-505` | contributor onboarding CTA | locally implemented and deployed candidate |
| `PROV-506` | advertiser campaign kit page | pending Shop Local sponsor review |
| `PROV-507` | weekly edition payload | pending Morrison/Red Rocks sample payload |
| `PROV-508` | SATCOM progress monitor | pending MCP/Linear auth repair or file hook display |

## 50-Agent Allocation

| Agent | Assignment | Primary Issue | Output File |
|---|---|---|---|
| H-01 | Morrison / Red Rocks SEO brief | PROV-504 | `agents/h-01-morrison-seo.md` |
| H-02 | Nederland SEO brief | PROV-504 | `agents/h-02-nederland-seo.md` |
| H-03 | Black Hawk SEO brief | PROV-504 | `agents/h-03-blackhawk-seo.md` |
| H-04 | Central City SEO brief | PROV-504 | `agents/h-04-centralcity-seo.md` |
| H-05 | Idaho Springs SEO brief | PROV-504 | `agents/h-05-idahosprings-seo.md` |
| H-06 | Georgetown SEO brief | PROV-504 | `agents/h-06-georgetown-seo.md` |
| H-07 | Evergreen SEO brief | PROV-504 | `agents/h-07-evergreen-seo.md` |
| H-08 | Golden SEO brief | PROV-504 | `agents/h-08-golden-seo.md` |
| H-09 | Morrison Shop Local seed plan | PROV-503 | `agents/h-09-morrison-shoplocal.md` |
| H-10 | Nederland Shop Local seed plan | PROV-503 | `agents/h-10-nederland-shoplocal.md` |
| H-11 | Black Hawk casino/dining seed plan | PROV-503 | `agents/h-11-blackhawk-shoplocal.md` |
| H-12 | Central City casino/history seed plan | PROV-503 | `agents/h-12-centralcity-shoplocal.md` |
| H-13 | Idaho Springs rafting seed plan | PROV-503 | `agents/h-13-idahosprings-shoplocal.md` |
| H-14 | Georgetown tourism seed plan | PROV-503 | `agents/h-14-georgetown-shoplocal.md` |
| H-15 | Evergreen services seed plan | PROV-503 | `agents/h-15-evergreen-shoplocal.md` |
| H-16 | Golden outdoor/dining seed plan | PROV-503 | `agents/h-16-golden-shoplocal.md` |
| H-17 | Morrison weekly edition sample | PROV-507 | `agents/h-17-morrison-weekly.md` |
| H-18 | Nederland weekly edition sample | PROV-507 | `agents/h-18-nederland-weekly.md` |
| H-19 | Black Hawk weekly edition sample | PROV-507 | `agents/h-19-blackhawk-weekly.md` |
| H-20 | Central City weekly edition sample | PROV-507 | `agents/h-20-centralcity-weekly.md` |
| H-21 | Idaho Springs weekly edition sample | PROV-507 | `agents/h-21-idahosprings-weekly.md` |
| H-22 | Georgetown weekly edition sample | PROV-507 | `agents/h-22-georgetown-weekly.md` |
| H-23 | Evergreen weekly edition sample | PROV-507 | `agents/h-23-evergreen-weekly.md` |
| H-24 | Golden weekly edition sample | PROV-507 | `agents/h-24-golden-weekly.md` |
| H-25 | Contributor upload CTA copy | PROV-505 | `agents/h-25-contributor-cta.md` |
| H-26 | Photographer/video upload CTA copy | PROV-505 | `agents/h-26-photo-video-cta.md` |
| H-27 | Business claim CTA copy | PROV-505 | `agents/h-27-business-claim-cta.md` |
| H-28 | Event submission CTA copy | PROV-505 | `agents/h-28-event-submit-cta.md` |
| H-29 | LTO/opinion CTA copy | PROV-505 | `agents/h-29-lto-cta.md` |
| H-30 | Advertiser tier page outline | PROV-506 | `agents/h-30-advertiser-tiers.md` |
| H-31 | Sponsor carousel spec copy | PROV-506 | `agents/h-31-carousel-spec.md` |
| H-32 | Newsletter sponsor offer | PROV-506 | `agents/h-32-newsletter-sponsor.md` |
| H-33 | Shop Local lead form spec | PROV-506 | `agents/h-33-lead-form-spec.md` |
| H-34 | Campaign reporting promise | PROV-506 | `agents/h-34-reporting-promise.md` |
| H-35 | SATCOM thumbnail QA | PROV-501 | `agents/h-35-thumbnail-qa.md` |
| H-36 | SATCOM blocker text QA | PROV-501 | `agents/h-36-blocker-qa.md` |
| H-37 | Town data schema QA | PROV-502 | `agents/h-37-town-schema-qa.md` |
| H-38 | Shop Local schema QA | PROV-503 | `agents/h-38-shoplocal-schema-qa.md` |
| H-39 | SEO schema QA | PROV-504 | `agents/h-39-seo-schema-qa.md` |
| H-40 | Contributor link safety QA | PROV-505 | `agents/h-40-link-safety-qa.md` |
| H-41 | Sponsor labeling QA | PROV-506 | `agents/h-41-sponsor-label-qa.md` |
| H-42 | Weekly edition no-email QA | PROV-507 | `agents/h-42-weekly-no-email-qa.md` |
| H-43 | Progress monitor spec | PROV-508 | `agents/h-43-progress-monitor-spec.md` |
| H-44 | File-hook monitor spec | PROV-508 | `agents/h-44-file-hook-monitor.md` |
| H-45 | Linear import readiness QA | PROV-508 | `agents/h-45-linear-import-qa.md` |
| H-46 | MCP blocker summary | PROV-508 | `agents/h-46-mcp-blocker-summary.md` |
| H-47 | GitHub auth blocker summary | PROV-508 | `agents/h-47-github-auth-summary.md` |
| H-48 | Production smoke checklist | PROV-508 | `agents/h-48-production-smoke.md` |
| H-49 | SATCOM presentation summary | PROV-508 | `agents/h-49-presentation-summary.md` |
| H-50 | Final Codex/Claude handoff | PROV-508 | `agents/h-50-codex-claude-handoff.md` |

## Execution Order

1. Run H-35 through H-39 first for QA on completed foundation files.
2. Run H-01 through H-08 for SEO pillar templates.
3. Run H-17 through H-24 for weekly edition sample payloads.
4. Run H-25 through H-34 for contributor and advertiser CTAs.
5. Run H-43 through H-50 for SATCOM progress monitor and blocker tracking.

## Progress Hook

Every agent appends:

```text
## 2026-05-14 HH:MM - H-XX Topic
- Changed:
- Decisions:
- Blockers:
- Next:
- Files proposed or created:
```

## Stop Conditions

- Stop if an agent asks to edit source directly.
- Stop if an agent asks for DNS, Plesk, secrets, `.env`, customer data, Sendy, or PDF pipeline access.
- Stop if Linear auth or MCP hook repair is required; hand that back to Codex/Claude as a separate task.
- Stop before live email, subscriber import, or production data mutation.
