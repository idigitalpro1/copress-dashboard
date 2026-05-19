# Stan's Inventory Scrape Command

Use this when refreshing the public Stan's Auto Sales inventory snapshot for the campaign kit.

## Skill Route

Use the `firecrawl-scrape` skill against the official public inventory page:

```bash
firecrawl scrape "https://www.stansautosalesllc.com/inventory" --format markdown,links --wait-for 3000 -o /tmp/stans-inventory-scrape/firecrawl-inventory.json
```

Normalize the scrape into:

- `data/stans-inventory-snapshot.json`
- `data/stans-inventory-snapshot.csv`
- `data/stans-inventory-snapshot.md`

## Publication Rule

Treat the scrape as a working snapshot only. Do not publish specific price, mileage, availability, financing, warranty, or vehicle-condition claims without same-day confirmation from Stan's Auto Sales.
