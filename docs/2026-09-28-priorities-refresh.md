# September 28 priorities evidence refresh

Status: prepared for review; this record does not assert a production deployment.

The public `/codex` priority summary still used September 7 statuses after later releases were recorded in `idigitalpro1/codex`. The page and read-only MCP now share updated priority text, individual evidence dates and links, and explicit original target dates. The approved order remains unchanged. Operator connection evidence remains dated September 7 and is explicitly historical.

Sources reviewed on September 28:

- `idigitalpro1/codex/SOURCE_OF_TRUTH.md`, `CURRENT_STATUS.md`, `BUSINESS_PLAN_2026.md`, and `TOP_10_DEVELOPMENT_PRIORITIES.md`.
- `ops/2026-09-27-multisite-release-review.md` and `ops/2026-09-27-villager-sept-24-hof-owner-share.md`.
- September 12 restoration evidence in `CURRENT_STATUS.md` and its canonical `AWS_DARK_FALLBACKS.md` reference.

The refresh reports dated release records, not a new live audit of every publication or provider. It records the Villager refresh, Aspen October edition, SATCOM Newsletter Studio, remaining 5280.menu remediation, and email delivery gates. It preserves the distinction between draft preparation and provider-confirmed sending. Private subscriber records, financial details and credentials are not included.

Validation: build, all 29 existing tests, diff whitespace check, and local Chrome inspection of the priority section. Local runtime: Node 24.20.0; package declares Node 22.x. No production deployment, campaign, payment or infrastructure change was performed by this refresh.

Rollback after any separately authorized release: revert the refresh commit and rebuild `codex.html` from `data/codex/context.json` and `scripts/build-codex.mjs`.
