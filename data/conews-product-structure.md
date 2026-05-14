# CoNews.press Product Structure

**Status:** Active planning packet — ready for Codex implementation  
**Generated:** 2026-05-14  
**Owner:** Hermes/Aileen (planning) → Codex/Claude (execution)  
**Guardrail:** No DNS, deploy, subscriber import, or production content without review.

---

## 1. Brand Registry

Each brand maps to one or more active lanes. Old admin panels (DashTail, Register-Call billing) are not linked; they remain available only as backend fallback surfaces.

| Brand | Canonical Host(s) | Active Lane | Revenue Model | Notes |
|-------|-------------------|-------------|---------------|-------|
| **conews.press** | `admin.conews.press` | Operating spine | General admin hub | Primary operator console. Valid admin host. |
| **5280.menu** | `5280.menu`, `admin.5280.menu`, `banking.5280.menu` | Plesk hub / legacy | Subdomains: API, admin SPA, billing | Role unresolved; not canonical for any single workflow. |
| **registercall.com** | `admin.registercall.com`, `registercall.com` | Register-Call public/digital | Digital subscription | Valid admin host, ops status returns 200. |
| **weeklyregistercall.com** | `weeklyregistercall.com` | Paid print + print+digital | Print subscription | Subscription-rate/payment needs audit. |
| **Colorado Gambler** | `gambling.conews.press` | Gambling vertical | Sponsor/ad revenue | Forward candidate: `ColoradoGambler.com`. Use `cg-campaign-kit/` assets. |
| **empire-courier.com** | `empire-courier.com` | Placeholder | — | Low priority; no active content pipeline. |

**Valid admin hosts (as of 2026-05-01):**
- `https://admin.conews.press`
- `https://admin.registercall.com`

**Invalid unless DNS/proxy intentionally added:**
- `https://admin.copress.news` (no DNS answer)

---

## 2. Operational Pipelines

Six pipelines. Each has a status, data source, data contract, and implementation readiness.

### 2.1 Dashboard / SATCOM Ownership Board

**Status:** Live (static) — cards render in `index.html`
**Current state:** 10 dashboard cards with 5 empty workbenches (under construction)
**Data source:** Browser `localStorage` + live API (Supabase, Sendy)
**Data contract:** `view-` IDs map to `<div>` panels; cards use `data-view=` routing

**What is done:**
- Main dashboard (`/`) with sidebar nav, topbar, 10 cards
- Night press atmosphere layer (gear animations, spotlight, noise grain)
- View switching via `navTo()`, 5 module panels (editorial, directory, cities, marketing, accounting)
- Dashboard cards: Admin HQ, Editorial Desk, Marketing Hub, Shop Local, City Sites, Accounting, Docs Hub, Stationery, Colorado Gambler, SATCO Academy, Linear, Hermes Orchestrator, API Vault

**What is missing:**
- Live data hydration for editorial (Supabase)
- Live data hydration for marketing (Sendy)
- SATCOM ownership board with 8 town cards showing status, owner, blockers, next action
- Phase/priority badge system on city cards

**Ready for Codex:** Yes — Pure dashboard UI/data wiring. No external config needed.

---

### 2.2 City-Site Rollout Tracker

**Status:** Planning data complete, UI not implemented
**Data source:** `data/conews-city-rollout-matrix.md`, `data/conews-town-rollout.json`
**Data contract:** Towns have `priority`, `canonicalHost`, `editorialLead`, `shopLocalFocus`, `launchStatus`, `phase`

**First 8 sites:**

| Priority | Town | Host | Phase | Editorial Lead | Launch Status |
|---|---|---|---|---|---|
| 1 | Morrison / Red Rocks | `redrocks.press`, `morrison.conews.press` | Pilot | Paul + Joathon | Pilot |
| 2 | Nederland | `nederland.conews.press` | Pilot | Patrick + Paul | Pilot |
| 3 | Black Hawk | `blackhawk.conews.press`, `gambling.conews.press` | Sprint 1 | Joathon + Patrick | Sprint 1 |
| 4 | Central City | `centralcity.conews.press` | Sprint 1 | Joathon + Patrick | Sprint 1 |
| 5 | Idaho Springs | `idahosprings.conews.press` | Sprint 2 | Paul + Joathon | Sprint 2 |
| 6 | Georgetown | `georgetown.conews.press` | Sprint 2 | Patrick + Paul | Sprint 2 |
| 7 | Evergreen | `evergreen.conews.press` | Sprint 3 | Patrick + Joathon | Sprint 3 |
| 8 | Golden | `golden.conews.press` | Sprint 3 | Patrick + Paul | Sprint 3 |

**Per-town launch checklist (8 steps):**
1. Town landing page (title, meta, JSON-LD Organization)
2. Weekly edition shell (front page, follow-ups, sports/events, Shop Local, sponsor strip)
3. Shop Local seed list (20 verified businesses or research placeholder)
4. Events calendar source list
5. Author lane assignment (Patrick, Joathon, Paul)
6. Contributor upload link + onboarding CTA
7. Sponsor CTA + intake form link
8. SATCOM dashboard card (thumbnail, status, blockers, next action)

**Launch order:**
- Phase A (Two-Town Proof): Morrison/Red Rocks + Nederland
- Sprint 1 (Revenue Pair): Black Hawk + Central City (casino ad revenue)
- Sprint 2 (Outdoor Pair): Idaho Springs + Georgetown
- Sprint 3 (Scale Pair): Evergreen + Golden

**What is done:** Rollout matrix doc, town rollout JSON, city-site data contracts.
**What is missing:** Landing page templates, weekly edition builder, per-city SATCOM dashboard cards.

**Ready for Codex:** Yes — All data files present. No external config for UI stubs.

---

### 2.3 Shop Local Directory Pipeline

**Status:** Data schema complete, pipeline UI not implemented
**Data source:** `data/conews-shoplocal-schema.json`, `data/conews-shoplocal-schema.csv`, `data/conews-shoplocal-rollout-packet.md`
**Data contract:** DirectoryRecord(slug, name, address, city, state, zip, phone, website, category, geographyType, geographyValue, status, sponsorSlug, verified, ocrFields, sourceTag)

**Intake sources (supported schemas):**
- Google Places API
- Apify scraper exports
- CSV import
- OCR scan (business card wall)
- CRM exports
- Civic organization directories

**Pipeline stages:**
1. Source fetch — adaptDirectorySource() normalizes from any source format
2. Normalize — normalizeBusinessRecord() produces canonical contract
3. Dedup — detectDirectoryDuplicates() checks staged batch + simulated DB
4. Review — operator approves/rejects/merges each record
5. Purge — publish targets: city sites, print directory, newsletter feature block, social campaign queue, sales CRM follow-up, Build Kit queue, Sendy onboarding queue

**Categories covered:** restaurants, lodging, retail, services, civic orgs, schools, faith communities, government offices, tourism, professional services, legal/financial, home/garden, outdoor recreation, nonprofits, and more.

**Geography types:** town, zip, county, region, event

**What is done:** Schema JSON/CSV, rollout packet, campaign kit templates (8 template types).
**What is missing:** Full pipeline UI (import → clean → dedup → review → publish), live source fetch integration.

**Ready for Codex:** Yes — All data contracts present. Backend integration needs Supabase/external keys.

---

### 2.4 News / Editorial Pipeline

**Status:** UI shell exists, no data source connected
**Data source:** Supabase `public_posts` (filtered by site_key), or browser `localStorage.copress_editorial_queue_v1` fallback
**Data contract:** Article(slug, title, meta_description, body, site_key, author, category, tags, seo_pillars, publish_date, status)

**What is done:**
- Editorial desk card on dashboard (workbench panel)
- Weekly edition sample: `data/conews-weekly-edition-sample.json` + `.md`
- Contributing workflow skeleton
- SEO pillar template system: `data/conews-seo-pillar-templates.json` (+ CSV, MD)
- News sections SEO packet: `data/conews-news-sections-seo-packet.md`

**What is missing:**
- Supabase connection for live editorial pipeline
- Draft queue management UI
- AI story idea generator powered by Hermes/Ollama
- Weekly edition renderer
- Carousel publishing to city sites

**Ready for Codex:** Partially — UI work is doable; live data requires Supabase credentials in dashboard localStorage (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).

---

### 2.5 Sponsor / Ad Carousel + Campaign Kit Lane

**Status:** Campaign kit assets present, generator logic not implemented
**Data source:** `cg-campaign-kit/` (banners, editorial templates, email templates, SEO JSON), `data/conews-advertiser-campaign-kit.json`, `data/conews-campaign-kits-packet.md`
**Data contract:** CampaignKit(town, brands, businessName, industry, tier, banners[], editorial[], email[], seo_meta, launch_date)

**Banner specs (in `cg-campaign-kit/banners/`):**
- `banner-leaderboard-728x90.html`
- `banner-mobile-320x50.html`
- `banner-medium-rect-300x250.html`
- `banner-skyscraper-160x600.html`
- `banner-social-square-1080x1080.html`
- `banner-half-page-300x600.html`

**Campaign generation flow:**
1. Free local Hermes/Ollama models generate copy and structure
2. Premium artwork escalated only when operator selects premium (Nano Banana 2 / Claude design / Google AI Studio)
3. Output stored in `localStorage.copress_campaign_handoff`
4. Link to `/newsletter?campaign=latest` for newsletter distribution

**What is done:** Full static banner kit, 5 editorial templates, SEO meta schemas.
**What is missing:** Automated campaign kit generator UI, sponsor tier definitions, ad compliance tracking.

**Ready for Codex:** Yes — All assets present. Generator UI is static-only work.

---

### 2.6 Contributor Onboarding + Upload Lane

**Status:** CTA template exists, upload workflow not implemented
**Data source:** `data/conews-contributor-onboarding-cta.json` (+ CSV, MD)
**Data contract:** Contributor(email, name, role, town, uploadTypes[], status, onboardedAt, lastActive)

**Upload types:** photos, editorial articles, video, classifieds, civic organization docs

**What is done:** Contributor onboarding CTA pattern data, onboarding JSON/CSV/MD templates.
**What is missing:** Upload form UI, file type validation, review queue, Supabase integration for actual uploads.

**Ready for Codex:** Yes — UI stubs can be built from data contracts alone.

---

## 3. Data Contracts Inventory

| Contract | Source File(s) | Used By |
|----------|----------------|---------|
| Town rollout | `conews-town-rollout.json` | City sites, dashboard |
| City rollout matrix | `conews-city-rollout-matrix.md` | Dashboard cards, Linear issues |
| Shop local schema | `conews-shoplocal-schema.json`, `.csv` | Directory pipeline |
| Contributor onboarding | `conews-contributor-onboarding-cta.json`, `.csv`, `.md` | Contributor lane |
| Advertiser campaign kit | `conews-advertiser-campaign-kit.json`, `.csv`, `.md` | Marketing + campaign generator |
| SEO pillar templates | `conews-seo-pillar-templates.json`, `.csv`, `.md` | Editorial pipeline |
| Weekly edition sample | `conews-weekly-edition-sample.json`, `.md` | Editorial renderer |
| Register call rollout | `register-call-rollout-issues.json`, `.csv` | Register Call admin workflow |
| SATCOM progress | `conews-satcom-progress-monitor.json`, `.md` | Dashboard monitoring |
| Sprint kanban | `conews-next-sprint-kanban.json`, `.csv` | Linear/GitHub issue sync |
| CMS execution policy | `conews-hermes-execution-policy.json`, `.md` | Hermes/Codex handoff |
| Campaign kits packet | `conews-campaign-kits-packet.md` | Marketing Hub |
| Shop local rollout | `conews-shoplocal-rollout-packet.md` | Directory pipeline |
| Architecture optimization | `conews-architecture-optimization.md` | Overall planning |
| News sections SEO packet | `conews-news-sections-seo-packet.md` | Editorial pipeline |
| Digital weekly delivery engine | `05_digital_weekly_delivery_engine.md` | Editorial workflow |
| Sponsor spec | `03_sponsor_spec.md` | Marketing Hub |
| Authored workpackets | `02_authored_workpackets.md` | Editorial content pipeline |
| Deploy hooks | `conews-deploy-hooks.md` | Deployment automation |
| Hermes command packet | `conews-hermes-command-packet.md` | Agent routing |
| Hermes policy acknowledgment | `conews-hermes-policy-ack.md` | Agent governance |
| Hermes 50-agent allocation | `conews-hermes-50-agent-allocation.md` | Agent capacity planning |
| Hermes kanban run | `conews-hermes-kanban-run.md` | Kanban sync protocol |
| Hermes/Claude handoff | `conews-hermes-claude-handoff.md` | Agent transition |
| SATCOM handoff summary | `conews-satcom-handoff-summary.md` | SATCOM progress tracking |

---

## 4. Dashboard Pages Inventory

| Route | File | Status | Purpose |
|-------|------|--------|---------|
| `/` | `index.html` | Live | Main SATCOM dashboard with sidebar nav |
| `/network` | `network.html` | Live | Network HQ (server IP, 6 property cards) |
| `/docs` | `docs.html` | Live | Documentation Hub (bulk import, NotebookLM) |
| `/newsletter` | `newsletter.html` | Live | Newsletter Studio (6-step designer) |
| `/apistore` | `apistore.html` | Live | API Vault (key store, MCP injection) |
| `/learn` | `learn.html` | Live | SATCO Academy (72 flash cards, XP system) |
| `/linear` | `linear.html` | Live | Linear integration (live issues, projects) |
| `towns.html` (proposed) | — | To build | City site rollout tracker |
| `shoplocal.html` (proposed) | — | To build | Shop Local directory pipeline |
| `editorial.html` (proposed) | — | To build | News editorial pipeline |
| `contributors.html` (proposed) | — | To build | Contributor onboarding/upload lane |

---

## 5. Deployment & Sync

**Local to Vercel:**
```bash
cd /Users/Ace/Codex/apps/copress-dashboard
git add <changed-files>
git commit -m "feat: ..."
git push origin main
```

**Vercel config:** ``version: 2, cleanUrls: true, trailingSlash: false`` — `towns.html` serves at `/towns` automatically.

**GitHub push status:** Blocked — pending credential repair before push. Vercel auto-deploys on push to main.

---

## 6. Implementation Plan (5 Phases)

### Phase 1: SATCOM Ownership Board (Week 1)
**PR:** `feat(ownership): add conews ownership board to dashboard`
**Change:** Add 8 town cards to `index.html` dashboard. Each shows: town name + thumbnail, phase/priority badge, editorial lead(s), status (planned → pilot → sprint → complete), 1-line blocker, next action.
**Validation:** `curl https://copress-dashboard.vercel.app/ | grep -c "ownership-card"` → expect 8+ matches

### Phase 2: Towns Hub Page (Week 2)
**PR:** `feat(towns): add towns.html with rollout tracker`
**Change:** New page at `/towns.html` with phase timeline, 8 town cards with expandable details, launch checklist per town, data source link to `conews-town-rollout.json`.
**Validation:** `curl https://copress-dashboard.vercel.app/towns | grep -c "town-card"` → expect 8

### Phase 3: Shop Local Pipeline Stub (Week 3)
**PR:** `feat(shoplocal): directory pipeline interface`
**Change:** New page at `/shoplocal.html` with import stage selector, preview pane showing normalized `ShopLocal` records, dedup detection panel, review actions, export to JSON/CSV.
**Validation:** Page loads, imports CSV file, displays normalized records, no network calls require credentials.

### Phase 4: Editorial + Contributor Connect (Week 4)
**PR:** `feat(editorial): connect editorial and contributor lanes`
**Change:** Supabase connection for editorial drafts/published posts, Contributor upload lane UI with file type validation, weekly edition renderer using `conews-weekly-edition-sample.json`.
**Validation:** `curl https://copress-dashboard.vercel.app/editorial` loads, shows data if Supabase keys present, falls back to `localStorage` otherwise.

### Phase 5: Linear Sync + MCP Repair (Week 5)
**PR:** `feat(operations): linear issue sync and MCP repair`
**Change:** Auto-sync `conews-next-sprint-kanban.json` to Linear issues, restore MCP hooks (`~/bin/mcp-status`), update `conews-satcom-progress-monitor.json`.
**Validation:** Linear API responds, issues created, `mcp-status` shows EDGE ok.

---

## 7. Blockers

1. **Linear API key** — Not set in dashboard localStorage. Needs `localStorage.linear_api_key` for live issue sync.
2. **GitHub push auth** — Blocked. Fix: `git remote set-url origin git@github.com:idigitalpro1/copress-dashboard.git` + SSH key.
3. **Supabase keys** — Live only in dashboard browser localStorage. Not in repo (by security rule).
4. **3CX runtime config** — Missing. Needs `.env` on server.
5. **MCP hooks** — Not green status. File-based progress is the active fallback lane.

---

## 8. Files Generated in This Block

- This file: `data/conews-product-structure.md`

---

## 9. Codex Handoff Notes

**Next agent:** The product structure is defined above. Recommended first visible change to dashboard: Phase 1 — ownership board cards. It is pure dashboard UI, needs no external config, and gives the operator immediate visible progress.

**File paths to edit:**
- `/Users/Ace/Codex/apps/copress-dashboard/index.html` — add ownership card templates in `view-cities` panel
- `/Users/Ace/Codex/apps/copress-dashboard/data/conews-town-rollout.json` — use as data source for 8 town cards
- `/Users/Ace/Codex/apps/copress-dashboard/index.html` — add new `nav-item` in sidebar for `/towns`

**Constraints:**
- No DNS/Plesk/SSL changes
- No secret keys in repo
- No production content publish
- No `git clean` or `git add -A`
- No Sendy rebuilds or PDF-to-article pipeline work

**Validation commands (after deployment):**
```bash
curl -sS https://copress-dashboard.vercel.app/ | grep -c "ownership-card"  # expect 8+
curl -sS https://copress-dashboard.vercel.app/towns | grep -c "town-card"   # expect 8
curl -sS https://copress-dashboard.vercel.app/shoplocal | head -20           # expect HTML with data-view
```
