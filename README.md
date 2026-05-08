# copress-dashboard — The Publishing Spine

**Live:** https://copress-dashboard.vercel.app  
**Stack:** Static HTML/CSS/JS · Vercel · GitHub auto-deploy  
**Repo:** `idigitalpro1/copress-dashboard`

SATCOM is the command center for copress.news — a Colorado mountain newspaper network covering Black Hawk, Central City, Nederland, Georgetown, and Idaho Springs.

## SATCOM / SATCO Brand Lane

- **SATCOM:** main dashboard title and operator command surface.
- **SATCO Academy:** staff learning lane, including the Daily Quick training prompt.
- **NationalIntelligence.com:** brand domain for the aerospace-intelligence staff academy concept.
- **Asset rule:** use original aerospace/SATCOM styling only; do not reuse official government seals as brand marks.

---

## Pages

| Route | File | Status | Description |
|-------|------|--------|-------------|
| `/` | `index.html` | ✅ Live | Main dashboard — sidebar nav, 10 cards, live data hooks, 5 module workbenches |
| `/network` | `network.html` | ✅ Live | Network HQ — server IP, 6 property cards, 3CX phone system |
| `/docs` | `docs.html` | ✅ Live | Documentation Hub — bulk import, NotebookLM queue, Notion sync |
| `/newsletter` | `newsletter.html` | ✅ Live | Newsletter Studio — 6-step designer, 3 templates, Sendy API |
| `/apistore` | `apistore.html` | ✅ Live | API Vault — secure key store, MCP injection, .env export |
| `/learn` | `learn.html` | ✅ Live | SATCO Academy — 72 flash cards, XP system, 9 levels, 18 badges |
| `/linear` | `linear.html` | ✅ Live | Linear integration — live issues, cycles, projects, quick-create |

---

## Sidebar Navigation

**Admin section**
- Admin HQ — primary launch surface for operator tools
- CoPress Dashboard — `https://copress-dashboard.vercel.app/`
- Hermes Dashboard — `http://127.0.0.1:9119/sessions`
- Hermes Crew Bridge — `http://127.0.0.1:8793/health`
- Kanban Ops — `http://127.0.0.1:8096`
- Client Onboarding — `https://onboarding.copress.news` (`idigitalpro1/onboarding-link`; DNS must resolve before public use)
- Microsoft 365 Login — `https://admin.microsoft.com/Adminportal/Home#/users` for MyAppStore.biz tenant staff mailboxes and aliases

Old DashTail/Register-Call/Billing admin panels are intentionally not linked from the dashboard. Keep them available only as backend fallback surfaces until their workflows are fully absorbed here.

**Publishing section**
- Dashboard (main view)
- Editorial Desk 🚧 — article pipeline, draft queue, AI story ideas
- Shop Local 🚧 — business directory
- City Sites 🚧 — per-city content status

**Revenue section**
- Marketing Hub 🚧 — campaign builder, Sendy integration
- Accounting 🚧 — Stripe, QuickBooks, invoices

**Tools section**
- Network HQ → `/network`
- Docs Hub → `/docs`
- Stationery → `data-view=stationery`
- Hermes Crew → `data-view=brains`
- Newsletter Studio → `/newsletter`
- API Vault → `/apistore`
- Linear → `/linear`
- SATCO Academy → `/learn`

---

## Dashboard Cards

| Card | Links to | Description |
|------|----------|-------------|
| Admin HQ | `data-view=admin` | Primary operator/admin launcher |
| Editorial Desk | `data-view=editorial` | Article pipeline entry point |
| Marketing Hub | `data-view=marketing` | Campaign tools |
| Shop Local | `data-view=directory` | Business directory |
| City Sites | `/network` | Network ownership screen |
| Accounting | `data-view=accounting` | Financial tools |
| Docs Hub | `/docs` | Documentation center |
| Stationery | `data-view=stationery` | Browser-local file template card |
| Colorado Gambler | `data-view=directory` | Gambling vertical and casino directory loader |
| SATCO Academy | `/learn` | Onboarding flash cards |
| Linear | `/linear` | Issue tracking |
| Hermes Orchestrator | `data-view=brains` | Local Qwen chat, Crew runner, jobs, and routing status |
| (implicit) API Vault | `/apistore` | Key management |

---

## Live Dashboard Data

The dashboard attempts to hydrate top-level cards from browser-stored API keys:

| Card | Values | Source |
|------|--------|--------|
| Editorial Desk | Drafts, published count, this-week count, recent article queue | Supabase REST `public_posts` filtered by `site_key=registercall` |
| Marketing Hub | Subscriber count | Sendy `/api/subscribers/count` |

Keys are read from both the dashboard API panel (`copress_api_*`) and API Vault (`api_vault`), so either setup path works. Required values:

| Service | Required keys |
|---------|---------------|
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Sendy | `SENDY_URL`, `SENDY_API_KEY`, and at least one list ID (`SENDY_LIST_ID`, `SENDY_LIST_PAID`, `SENDY_LIST_EDITORIAL`, `SENDY_LIST_MARKETING`, or `SENDY_LIST_SALES`) |

If credentials are missing or the browser blocks the upstream request, the card keeps its fallback value and the status LED switches to warning.

---

## Press Atmosphere (Background Effects)

The main dashboard has a newspaper press atmosphere layer at `z-index:0`:

**Gears** — 5 SVG gears with machine-cut teeth, spokes, bolt-detail circles:
- Gear A: 440px, 14 teeth, dark teal-steel `#455a64`, 72s clockwise
- Gear B: 280px, 10 teeth, mid blue-steel `#607d8b`, 48s counter-clockwise
- Gear C: 160px, 8 teeth, light steel `#90a4ae`, 28s clockwise
- Gear D: 320px, 11 teeth, aged press steel `#4e6070`, 58s counter-clockwise
- Gear E: 140px, 7 teeth, brushed steel `#78909c`, 22s clockwise

**Spotlight** — 900px radial gradient drifts lazily in a 55-second 7-waypoint cycle. Warm parchment in light mode, gold tint in dark mode.

**Placeholder gear watermarks** — each under-construction view has a ghost gear at bottom-right, 40s rotation, ~6% opacity.

Implementation locations:
- CSS: `index.html` press-atmosphere rules, `#spotlight`, `#gears-svg`, and `.module-placeholder-gear-hint`
- HTML: `#spotlight` and `#gears-svg` injected before `</body>`
- JavaScript: `gearPath(...)`, SVG gear generation, and placeholder watermark injection near the bottom of `index.html`

The atmosphere layer sits below the app shell. `#spotlight` and `#gears-svg` render at `z-index:0`; the sidebar, topbar, and content shell stay above at `z-index:1`.

---

## Hermes Agent Local Dashboard

Hermes Agent has two separate local surfaces:

| URL | Purpose | Use for |
|-----|---------|---------|
| `https://copress-dashboard.vercel.app/` → Hermes Crew | CoPress operator front end | Chat, crew jobs, status, local endpoint links |
| `http://127.0.0.1:9119/sessions` | Hermes Agent dashboard | Canonical human operator UI for sessions, analytics, models, logs, skills, plugins, profiles, config, keys |
| `http://127.0.0.1:8793` | Hermes Crew bridge | Local chat, crew run/status/result API, Qwen/Ollama routing |
| `http://127.0.0.1:8501` | Streamlit fallback | Local fallback chat and Crew Runner UI |
| `http://127.0.0.1:8642/v1` | OpenAI-compatible gateway | Open WebUI / API clients |

`http://127.0.0.1:9119/sessions` is the canonical Hermes dashboard URL returned by `hermes dashboard`. The dashboard API under `/api/*` is session-protected and can return `401 {"detail":"Unauthorized"}` when called directly without the embedded dashboard session token. That is expected for raw API calls and does not mean the Hermes dashboard is down.

For Open WebUI, point the OpenAI-compatible base URL at:

```text
http://127.0.0.1:8642/v1
```

The current gateway model id verified locally is `ollama-qwen`.

---

## SATCO Academy (`/learn`)

72 flash cards across 6 decks:

| Deck ID | Topic | Cards |
|---------|-------|-------|
| `ai-stack` | AI & Models | 12 |
| `editorial` | Editorial Workflow | 12 |
| `platform` | Platforms & Apps | 12 |
| `newsletter` | Newsletter & Sendy | 12 |
| `infra` | Server & Infrastructure | 12 |
| `api-tools` | APIs & Integrations | 12 |

**XP scoring:** 20pts (<10s) · 15pts (<30s) · 10pts (slow) · 2pts (consolation)  
**Levels:** Cub Reporter (0) → Reporter (200) → Staff Writer (500) → Senior Writer (1000) → Editor (1750) → Senior Editor (2750) → Managing Editor (3750) → Executive Editor (4500) → Publisher (5000)  
**Daily Challenge:** 10 random cards from all decks, +50 XP bonus, resets at midnight  
**State:** localStorage key `copress_academy_v2`

---

## Linear Integration (`/linear`)

Connects to Linear's GraphQL API (`https://api.linear.app/graphql`):

**Features:**
- Live issue list with priority icon, status dot, label, assignee, time ago
- Filter tabs: All / Urgent / In Progress / Todo / Done / Mine
- Inline search by title or identifier
- Quick-create bar: title + team + priority, Enter to submit
- Full create modal: title, description, team, priority, assignee, label
- Active cycle panel: progress bar, days remaining, breakdown
- Projects panel: icon, name, state, % complete
- Team members: avatar, email, issue count
- Click any issue → opens in Linear at correct team/issue URL

**Setup:** Enter Personal API key from `linear.app/settings/api` in the setup banner or Connection panel. Stored in `localStorage.linear_api_key` only — never transmitted externally.

---

## API Vault (`/apistore`)

Stores API keys in localStorage under `api_vault`. The dashboard also stores quick API panel values under `copress_api_*`.

| Key ID | Service |
|--------|---------|
| `google_places` | Google Places API |
| `apify_token` | Apify scraping |
| `gemini_key` | Google Gemini |
| `supabase_url` | Supabase project URL |
| `supabase_anon` | Supabase anon key |
| `sendy_url` | Sendy instance URL |
| `sendy_key` | Sendy API key |
| `sendy_list_id` / `SENDY_LIST_*` | Sendy subscriber list IDs |
| `stripe_secret` | Stripe secret key |

Export formats: `.env` file, JSON. MCP injection: copies key into clipboard for paste into MCP config.

---

## Network HQ (`/network`)

Shows full infrastructure ownership:

**Properties:**
1. registercall.com — WordPress editorial + Vite SPA
2. 5280.menu — Static watercolor redesign
3. copress-dashboard.vercel.app — THE SPINE (this app)
4. Colorado Gambler — gambling.conews.press vertical; ColoradoGambler.com forward candidate
5. 3CX Phone System — SIP extensions, AI receptionist
6. empire-courier.com — placeholder

## Colorado Gambler Campaign Kit

The imported `/cg-campaign-kit/` bundle comes from `/Users/Ace/Downloads/cg-campaign-kit.zip` and is served as static dashboard collateral:

- `/cg-campaign-kit/manifest.json`
- `/cg-campaign-kit/banners/banner-leaderboard-728x90.html`
- `/cg-campaign-kit/banners/banner-medium-rect-300x250.html`
- `/cg-campaign-kit/banners/banner-skyscraper-160x600.html`
- `/cg-campaign-kit/banners/banner-half-page-300x600.html`
- `/cg-campaign-kit/banners/banner-mobile-320x50.html`
- `/cg-campaign-kit/banners/banner-social-square-1080x1080.html`
- `/cg-campaign-kit/email/newsletter-casino-guide.html`
- `/cg-campaign-kit/email/newsletter-sportsbook-promos.html`
- `/cg-campaign-kit/editorial/press-release.md`
- `/cg-campaign-kit/editorial/sponsored-post.md`
- `/cg-campaign-kit/editorial/social-media-copy.md`
- `/cg-campaign-kit/seo/meta.json`
- `/cg-campaign-kit/seo/jsonld.json`

Recommended domain policy: use `gambling.conews.press` as the CoPress network vertical and forward `ColoradoGambler.com` to it after explicit DNS/Plesk approval.

**3CX SIP Extensions:**
- 17410 Patrick · 17413 Editorial · 17414 Subscriptions · 17415 Advertising · 17416 Production
- AI Receptionist: Twilio +18773578499 → claude-opus-4-5 → SIP route

**City Sites:** Black Hawk ⛏ · Central City 🎰 · Nederland 🏔 · Georgetown 🚂 · Idaho Springs ⛷

---

## Deploy

```bash
# Vercel auto-deploys on every push to main
git add .
git commit -m "feat: ..."
git push origin main
```

`vercel.json` config:
```json
{ "version": 2, "cleanUrls": true, "trailingSlash": false }
```

`cleanUrls: true` means `newsletter.html` serves at `/newsletter` — no `.html` in URLs.

---

## Design Tokens (CSS Variables)

```css
--navy:       #0a1628;   /* sidebar, topbar */
--navy-mid:   #111f38;
--navy-light: #1a2f4a;
--gold:       #c8a84b;   /* accent, borders, masthead */
--gold-pale:  #e8d49a;
--red:        #c0392b;   /* editorial alert color */
--warm-white: #fafaf8;   /* page background */
--paper:      #f4f2ed;   /* card backgrounds */
--rule:       #d8d4c8;   /* borders */
```

Fonts: `Playfair Display` (serif, headlines) · `DM Sans` (body) · `DM Mono` (metadata, code)

---

## Module Workbenches

These views are in `index.html` as `<div id="view-...">` sections. The JS view-switcher is already wired through `navTo(section)`.

```html
<div id="view-editorial">   <!-- Story queue, assignment form, daily list generator -->
<div id="view-directory">   <!-- Directory import staging and review lanes -->
<div id="view-cities">      <!-- Five-town readiness board -->
<div id="view-marketing">   <!-- Campaign brief to copy kit generator -->
<div id="view-accounting">  <!-- Invoice staging and billing handoff -->
```

Current behavior is intentionally browser-local:
- Editorial queue stores local drafts in `localStorage.copress_editorial_queue_v1` when Supabase credentials are missing.
- When `SUPABASE_URL` and `SUPABASE_ANON_KEY` are available, Editorial shows the 12 most recent `public_posts` rows and keeps the local queue as fallback.
- Directory import and invoice staging create operator handoff text in-page.
- Marketing campaign generation stores the latest kit in `localStorage.copress_campaign_handoff` and exposes a `Send to Newsletter Studio` link to `/newsletter?campaign=latest`; Newsletter Studio auto-loads that copy into the marketing template and shows a handoff banner.
- Marketing campaign kits follow the showcase pattern from `showcase.registercall.com/billsmobile`: branding first, industry pattern, invoice-manager item mapping, send options, follow-up/drip sequence, and newsletter/digital/print subscriber-list options.
- Campaign generation is local-first by default: free local Hermes/Ollama models generate copy and structure. Premium artwork is escalated only when the operator selects premium artwork, with Nano Banana 2 / Claude design / Google AI Studio noted as the art lane.
- Directory has a duplicable demo importer: source adapter → normalized business record → duplicate detection → review actions → JSON export. Demo state lives in `localStorage.copress_directory_batch_v1`.
- Directory intake includes visual evidence: a generated demo business-card wall plus an upload field for a photo of a card wall or scanned page from a local approved civic organization. Scan metadata lives in `localStorage.copress_directory_scan_meta_v1` and exports with the batch JSON.
- Directory scan intake now has an OCR / Parse Wall demo step. Parsed fields attach to staged records as `ocrFields`, including field confidence placeholders and scan label.
- Directory intake records include geography scope: `geographyType` (`town`, `zip`, `county`, `region`, or `event`) plus the entered town/ZIP/county value.
- Directory categories now cover restaurants, lodging, retail, services, civic organizations, schools, faith communities, government offices, tourism, professional services, legal/financial, home/garden, outdoor recreation, nonprofits, and more.
- Directory publish targets include city sites, print directory, newsletter feature block, social campaign queue, sales CRM follow-up, Build Kit queue, and Send Onboarding queue.
- Directory campaign kits are stored in `localStorage.copress_directory_campaign_kit` and include templates for Editorial Outreach, You're Invited, We'd Like Your Opinion, Claim Your Listing, Shop Local Welcome, Civic Partner Thank You, and Sponsor Prospect.
- Marketing Hub now links into the same shared intake engine instead of duplicating intake logic. Records carry `sourceTag` values such as `shoplocal`, `marketing-hub`, `editorial-outreach`, or `civic-scan`.
- Demo duplicate detection checks the staged batch plus a simulated main directory index (`MAIN_DIRECTORY_DB`); the same contract can be swapped to a real Supabase/main database lookup later.
- Final publishing, billing, and external writes still belong to the dedicated backend tools (`newsletter`, `invoicemanager-wrc`, Supabase, Stripe, Sendy).

Directory importer scaling pattern:
1. Replace `makeSeedBusinesses(...)` with a real source fetch or parser.
2. Keep `adaptDirectorySource(...)` to map Google Places, Apify, CSV, OCR scans/public walls, CRM, or scraper-specific shapes.
3. Keep `normalizeBusinessRecord(...)` as the canonical record contract.
4. Keep `detectDirectoryDuplicates(...)` and review statuses for operator approval.
5. Preserve `sourceTag` on every record so downstream marketing, Shop Local, editorial outreach, onboarding, and resident/business lists can share one dedupe path.
6. Move the same contract behind a backend when keys, publishing, or writes need server-side protection.
