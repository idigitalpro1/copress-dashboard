# Dynamic Menu Preview

`menu-preview.html` is a responsive 5280 Menu surface backed by one repository JSON file and a Vercel Function.

## Routes

- Preview page: `/menu-preview`
- Full feed: `/api/menus`
- Town filter: `/api/menus?town=empire`
- Static source: `/data/menus.json`

With Vercel `cleanUrls` enabled, `menu-preview.html` is published as `/menu-preview`. No route change is required in `vercel.json`.

## Loading model

The browser requests `/api/menus` first. If the Function is unavailable, it requests `/data/menus.json` and labels the page as a static JSON preview. Both paths use the same repository data, so the surface can launch without a database and later move to a CMS or restaurant portal without changing the front-end contract.

The API response wraps the town array with counts and version metadata:

```json
{
  "meta": {
    "schemaVersion": "1.0",
    "updatedAt": "2026-09-03T09:00:00-06:00",
    "source": "repository-seed",
    "requestedTown": null,
    "townCount": 2,
    "venueCount": 2,
    "itemCount": 4
  },
  "towns": []
}
```

## Data model

The source of truth is `data/menus.json`:

```text
town
├── id
├── name
├── placement
│   ├── state
│   └── label
└── venues[]
    ├── id
    ├── name
    ├── category
    └── items[]
        ├── id
        ├── name
        ├── price
        │   ├── display
        │   ├── amount
        │   └── currency
        ├── description
        └── tags[]
```

`price.display` is the reader-facing value. `amount` and `currency` are machine-readable and may remain `null` for sponsor inventory.

## Add a town or restaurant

1. Add a unique town object to `data/menus.json`.
2. Add one or more venue objects below that town.
3. Add menu items with a unique `id`, display price, description, and tags.
4. Add a town filter button in `menu-preview.html` if the town should have a dedicated quick filter.
5. Run the contract checks and verify mobile card scrolling.

The API automatically recalculates town, venue, and item counts. The endpoint allows public cross-origin GET and HEAD requests so future town pages can consume the same feed.

Run the repository checks with:

```bash
node scripts/verify-menu-preview.mjs
```

## Local preview

A plain static server exercises the JSON fallback:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/menu-preview.html`.

To exercise the API-first path locally, run a small Node HTTP harness that delegates `/api/menus` to `api/menus.js`, or use `vercel dev` in an authenticated Vercel environment.

## Publishing guardrails

- The current entries are presentation seed data supplied for this preview.
- Operators must verify prices, product availability, restaurant names, and sponsor availability before production publication.
- Do not add credentials, contact data, or private restaurant records to the public JSON.
- Moving storage to a CMS or database should preserve the response shape or introduce a new `schemaVersion`.
