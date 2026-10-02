# September 28 priorities evidence refresh

Status: published and verified on September 28 after explicit publisher approval.

PR #30 merged as `a3a5730ce151cf48f81d999b20e83d84c4d5ea2b`. GitHub production deployment `6721686481` succeeded at `https://copress-dashboard-b8sfmxtm9-5280menu.vercel.app`. Both `https://satcom.5280.menu` and `https://satcom.conews.press` serve the refreshed context. The selected Chrome priorities tab was reloaded and verified. Four SDK tool calls, the context resource and six prompts passed on both public MCP endpoints; priorities match the reviewed source exactly. The board reports its dated snapshot rather than live upstream data.

Previous production rollback candidate: `https://copress-dashboard-le24f0ucx-5280menu.vercel.app` (GitHub deployment `6721324394`, source `73d999f54c2ff1f16cbc35b849769d95fb97ae35`). Two sibling Vercel projects reported blocked deployments; the canonical `copress-dashboard` production deployment passed.

The public `/codex` priority summary still used September 7 statuses after later releases were recorded in `idigitalpro1/codex`. The page and read-only MCP now share updated priority text, individual evidence dates and links, and explicit original target dates. The approved order remains unchanged. Operator connection evidence remains dated September 7 and is explicitly historical.

Sources reviewed on September 28:

- `idigitalpro1/codex/SOURCE_OF_TRUTH.md`, `CURRENT_STATUS.md`, `BUSINESS_PLAN_2026.md`, and `TOP_10_DEVELOPMENT_PRIORITIES.md`.
- `ops/2026-09-27-multisite-release-review.md` and `ops/2026-09-27-villager-sept-24-hof-owner-share.md`.
- September 12 restoration evidence in `CURRENT_STATUS.md` and its canonical `AWS_DARK_FALLBACKS.md` reference.

The refresh reports dated release records, not a new live audit of every publication or provider. It records the Villager refresh, Aspen October edition, SATCOM Newsletter Studio, remaining 5280.menu remediation, and email delivery gates. It preserves the distinction between draft preparation and provider-confirmed sending. Private subscriber records, financial details and credentials are not included.

Validation: build, all 29 existing tests, diff whitespace check, and local Chrome inspection of the priority section. All 29 tests also passed on the declared Node 22 runtime (in addition to Node 24.20.0). This release changed the priority summary only; no campaign, payment or infrastructure setting was changed.

Rollback after any separately authorized release: revert the refresh commit and rebuild `codex.html` from `data/codex/context.json` and `scripts/build-codex.mjs`.

The post-release verifier now compares the deployed release ID, review date and exact priority records against the local reviewed context instead of a fixed September 7 release ID. Both public endpoints passed this stronger check.
