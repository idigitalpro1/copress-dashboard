# CODEX.md — CoNews SATCOM Consolidation: Kanban + Dev Strategy

**Owner:** Patrick (operator) · **Executor:** Codex/Claude · **Spine:** conews.press (copress-dashboard.vercel.app)
**Updated:** 2026-06-21
**Mission:** One admin, not many. Consolidate news-site operations onto **SATCOM** via **deep integration with thevillager.today admin** — never clone the admin onto each news site.

---

## North Star (the decision)

1. **thevillager.today admin = the canonical news admin** (most complete: articles, subscribers, breaking news, news-intelligence, payment links). It becomes **multi-tenant**: one admin, many sites, switched by `site_key`.
2. **SATCOM (this spine) = the control plane / portfolio.** It lists every owned asset (`/portfolio`), shows status, and **deep-links into the Villager admin with the right site context** — e.g. `thevillager.today/admin?site=denver-daily-post`. No second admin is built or cloned.
3. **New news assets onboard like 5280's towns** — a repeatable tenant pipeline (DB row → SATCOM card → DNS → seed → publish), not a new codebase each time.

> Why: cloning admin per site = N codebases to maintain and N outdated dashboards (the current pain). Multi-tenant + deep-link = one surface to maintain, infinite sites.

---

## Architecture (target state)

```
                 ┌────────────────────────────┐
                 │   SATCOM spine (conews)     │  /portfolio = Owned Assets
                 │   - portfolio.json (catalog)│  control plane + status + kits
                 │   - deep-links per site ────┼──┐
                 └────────────────────────────┘  │  ?site=<site_key>
                                                  ▼
        ┌──────────────────────────────────────────────────────┐
        │   thevillager.today ADMIN  (multi-tenant, ONE build)  │
        │   site switcher → site_key → scoped articles/subs/... │
        └───────────────┬──────────────────────────────────────┘
                         │ shared backend (tRPC + DB, site_key column)
       ┌─────────────┬───┴───────────┬───────────────┬──────────────┐
   thevillager    DenverDailyPost  ColoradoStatesman  thecorridor   national sites
   (metro)        (conews.press)   (state)            (DTC)         (officialus.press…)
```

- **Front-ends** can stay distinct per brand (theme/domain), but **all read/write one backend** filtered by `site_key` — exactly the registercall/Supabase `site_key` pattern already in use.
- **Admin is rendered once** (Villager admin) and scoped by the selected `site_key`.

---

## News-Asset Onboarding Pipeline ("the 5280 model" for news sites)

Per new news endpoint, same checklist every time (mirrors the 8-town rollout):

1. **Register** — add to `data/conews-portfolio.json` (name, url, market, category=`news`, status).
2. **Tenant** — add `site_key` to the shared backend; seed categories/sections.
3. **SATCOM card** — appears automatically on `/portfolio` from the JSON.
4. **Admin access** — Villager admin site-switcher gains the new `site_key` (no new code).
5. **DNS / hosting** — point domain (Vercel/Manus) — operator-gated.
6. **Seed content** — categories + 5–10 launch articles (bulk-publish pipeline already built).
7. **Distribution** — mark banner-eligible in portfolio → selectable for client kits.
8. **Status** — flip `planned → live` in portfolio.json.

---

## KANBAN

### ✅ Done
- **News-onboarding schema + tenant registry** — `data/conews-news-onboarding.json`: canonical per-tenant contract (site_key, market, brand, admin deep-link, 8-step checklist) + seeded tenants (Denver Daily Post, Colorado Statesman, The Corridor, national wire brands, Register Call). Locks in: one multi-tenant Villager admin, shared site_key backend, SATCOM deep-links.
- **Vertex control node** — `[SYNC GOOGLE AI]` live on aspen (`/api/vertex/sync` + `/api/vertex/health`), keyless SATCOM vault, stub-until-env. apex/www re-aliased.
- SATCOM `/portfolio` — Owned Assets recovered, data-driven (`data/conews-portfolio.json`, 61 assets).
- Market filter incl. **Metro Denver (NEW)**; A–Z dashboards; banner-endpoint → Copy-for-Kit export.
- Hermes Rollout Tracker (8 foothills towns).
- thevillager.today: hero/Latest News/Legal Notices/Real Estate/Author+TipJar/category pages live.

### 🔜 Next (this sprint — small, high-leverage)
- [ ] **N1** Add `/portfolio` link to spine `index.html` sidebar (discoverability).
- [ ] **N2** Confirm real domains/TLDs: `networknews.?`, Denver Daily Post host, Colorado Statesman, thecorridor.biz, presidentialpolitics, newsgrandcentral, officialus.press → update portfolio.json.
- [ ] **N3** Add a **"Open in Villager Admin"** deep-link field per news asset in portfolio.json + render a button on news cards.
- [ ] **N4** Audit & retire the **outdated dashboards** (list them; mark `deprecated` in portfolio so they drop off A–Z).

### 🏗 In Progress / This Phase
- [ ] **P1** Make Villager admin **multi-tenant**: add `site` query param → `site_key` context; site-switcher in admin header. (One PR; backend already has site scoping pattern.)
- [ ] **P2** Onboard **Denver Daily Post (conews.press)** as the first non-Villager tenant via the pipeline above (proves the model end-to-end).

### 📋 Backlog
- [ ] Colorado Statesman, thecorridor.biz onboarded as tenants.
- [ ] National view tenants: officialus.press, presidentialpolitics, newsgrandcentral, networknews, nationalintelligence.
- [ ] SATCOM ↔ Villager **live status** (pull article/subscriber counts into portfolio cards).
- [ ] Client-kit banner feed: wire Copy-for-Kit output directly into ricks.conews.press kit selection.
- [ ] **Google Vertex** integration — spec received & persisted. Vertex is the **pipeline engine for the aspen Editorial Control Node** (`[SYNC GOOGLE AI]`), not a Claude prompt. Canonical instruction: `aspen/VERTEX_PIPELINE_ENGINE_SPEC.md`; contract: `aspen/server/vertex/pipeline-spec.json`. **Next:** wire `AdminDashboard.handleSyncAI` (currently a mock) → `POST /api/vertex/sync` server route → Vertex w/ that systemInstruction → parse JSON to update node state. Needs: `GOOGLE_CLOUD_PROJECT`, location, service-account, `VERTEX_MODEL`. Stub route returns the contract until creds land.

---

## Optimized Dev Strategies

- **Reuse, don't rebuild.** The Villager codebase is the news-site template. New brands = new theme + `site_key`, same backend/admin.
- **One source of truth for the network map:** `data/conews-portfolio.json`. UI is generated from it. Edit data, not markup.
- **Deploy triggers:** spine + villager auto-deploy on push to `main`. Keep commits scoped; rebase over parallel commits (frequent on these repos).
- **Operator-gated actions** stay gated: DNS, prod content publish, secrets. Codex proposes; operator approves.
- **Local model first** per routing policy (Hermes/Qwen → Ollama → premium for hard/admin). Vertex to be added as a cloud tier next.
- **No secrets in repo.** Forge/Supabase/Stripe keys live in env/localStorage only.

## Open Decisions (need operator)
1. Multi-tenant admin lives **in thevillager.today** (recommended) vs. a new SATCOM-hosted admin? (Recommend: Villager — avoids the clone.)
2. Do non-Villager brands get distinct front-end repos, or all served from one themeable Villager build?
3. Confirm the new-domain list + TLDs (see N2).
