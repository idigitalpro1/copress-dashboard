# Hermes Handoff — Bulk ShopLocal Campaign Kit Generation

**Lane:** Hermes (local, hermes3:70b / OpenClaw). This is repetitive per-lead
work — keep it OFF the premium model per the routing policy. The premium model
already built the reusable template + generator; Hermes just runs the queue.

## What Hermes does

For each lead in `_kit-template/leads.json` → `queue[]`:

1. Build a lead `manifest.json` using the standard copress-dashboard schema
   (copy the shape from any shipped kit, e.g. `240-deer-road-campaign-kit/manifest.json`).
   Required keys: `campaign`, `brand`, `ecosystem`, `positioning`, `audience`,
   `colors`, `fonts`, `assets.hero`, `deliverables.publicLinks`,
   `officialFacts`, and optionally `pricing`, `kanban`, `sections`.
   **Do not invent prices, phone numbers, or property facts** — pull only from
   the lead's official source URL; leave unknowns blank for operator review.
2. Run the generator:
   ```bash
   python3 _kit-template/gen-kit.py <lead-manifest.json> <slug>
   ```
   This writes `copress-dashboard/<slug>-campaign-kit/` with `index.html`
   (config injected), `manifest.json`, and the `carousel/`.
3. Update that lead's entry in `leads.json` → `status: "generated"` and record
   the preview path `/<slug>-campaign-kit/`.

## Constraints (hard)

- Two links only per kit: campaign-kit (`#kit`) and the customer link.
- 7-day free trial, but the cart + checkout flow stays required (already in the
  template — do not remove).
- No claim of price / availability / specs unless it is in the lead's official
  source. Flag unverified facts for the operator; never publish them.
- Premium-model escalation only for: brand/positioning judgement calls, or a
  lead whose data doesn't fit the schema. Everything routine stays local.
- Do not modify `_kit-template/index.html` or `gen-kit.py` (the shared
  template/generator) — only generate per-lead kits from them.

## Verify before marking done

- `python3 -c "import json,glob;[json.load(open(f)) for f in glob.glob('copress-dashboard/*-campaign-kit/manifest.json')]"` passes.
- Each generated `index.html` contains a valid `#kit-config` JSON block.
- Local serve renders: nav shows only Campaign Kit + Customer Link; cart adds
  items; checkout modal requires name/email/payment; "Expand all sections"
  toggles the kanban/SEO accordions.

## Operator approval gate

Generation is safe/local. **Deploy to Vercel and any DNS/host change require
explicit operator approval** — Hermes prepares, the operator ships.
