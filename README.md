# copress-dashboard — The Publishing Spine

**Live:** https://copress-dashboard.vercel.app  
**Stack:** Static HTML/CSS/JS · Vercel · GitHub auto-deploy  
**Repo:** `idigitalpro1/copress-dashboard`

The command center for copress.news — a Colorado mountain newspaper network covering Black Hawk, Central City, Nederland, Georgetown, and Idaho Springs.

---

## Pages

| Route | File | Status | Description |
|-------|------|--------|-------------|
| `/` | `index.html` | ✅ Live | Main dashboard — sidebar nav, 9 cards, 5 placeholder views |
| `/network` | `network.html` | ✅ Live | Network HQ — server IP, 7 property cards, 3CX phone system |
| `/docs` | `docs.html` | ✅ Live | Documentation Hub — bulk import, NotebookLM queue, Notion sync |
| `/newsletter` | `newsletter.html` | ✅ Live | Newsletter Studio — 6-step designer, 3 templates, Sendy API |
| `/apistore` | `apistore.html` | ✅ Live | API Vault — secure key store, MCP injection, .env export |
| `/learn` | `learn.html` | ✅ Live | Staff Academy — 72 flash cards, XP system, 9 levels, 18 badges |
| `/linear` | `linear.html` | ✅ Live | Linear integration — live issues, cycles, projects, quick-create |

---

## Sidebar Navigation

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
- Newsletter Studio → `/newsletter`
- API Vault → `/apistore`
- Linear → `/linear`
- Staff Academy → `/learn`

---

## Dashboard Cards

| Card | Links to | Description |
|------|----------|-------------|
| Editorial Desk | `data-view=editorial` | Article pipeline entry point |
| Marketing Hub | `data-view=marketing` | Campaign tools |
| Shop Local | `data-view=directory` | Business directory |
| City Sites | `/network` | Network ownership screen |
| Accounting | `data-view=accounting` | Financial tools |
| Docs Hub | `/docs` | Documentation center |
| Staff Academy | `/learn` | Onboarding flash cards |
| Linear | `/linear` | Issue tracking |
| (implicit) API Vault | `/apistore` | Key management |

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

---

## Staff Academy (`/learn`)

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

Stores API keys in localStorage under `copress_keys_v1`:

| Key ID | Service |
|--------|---------|
| `google_places` | Google Places API |
| `apify_token` | Apify scraping |
| `gemini_key` | Google Gemini |
| `supabase_url` | Supabase project URL |
| `supabase_anon` | Supabase anon key |
| `sendy_url` | Sendy instance URL |
| `sendy_key` | Sendy API key |
| `stripe_secret` | Stripe secret key |

Export formats: `.env` file, JSON. MCP injection: copies key into clipboard for paste into MCP config.

---

## Network HQ (`/network`)

Shows full infrastructure ownership:

**Properties:**
1. registercall.com — WordPress editorial + Vite SPA
2. 5280.menu — Static watercolor redesign
3. admin.conews.press — codex-admin (Next.js)
4. admin.registercall.com — spine-admin
5. copress-dashboard.vercel.app — THE SPINE (this app)
6. 3CX Phone System — SIP extensions, AI receptionist
7. empire-courier.com — placeholder

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

## Under-Construction Views (Next Sprint)

These views are in `index.html` as `<div data-view="...">` sections. The JS view-switcher is already wired. Just build the HTML inside each section.

```html
<!-- Find these in index.html and fill in real content -->
<div data-view="editorial">  <!-- Article pipeline -->
<div data-view="directory">  <!-- Business directory -->
<div data-view="cities">     <!-- City site stats -->
<div data-view="marketing">  <!-- Campaign builder -->
<div data-view="accounting"> <!-- Stripe + invoices -->
```
