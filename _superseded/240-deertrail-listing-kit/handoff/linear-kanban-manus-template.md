# Linear / Kanban / Manus Template — Real-Estate Listing Kit

Use this template to route a 240-Deer Road-style **real-estate listing** kit
through SATCOM/CoMSAT. This is the real-estate variant of the industry-kit
pattern: it pairs a customer-facing interactive estimator with an internal
listing-agent dashboard.

## Linear Issue

Title:
Place real-estate listing content for `[Listing Address]`

Description:
Integrate or place a listing kit using the real-estate industry-kit pattern.

Fields:
- Listing address:
- Listing ID / MLS:
- Brokerage: `HipCribs`
- Market / county:
- Source estimator URL: (e.g. a Manus-built `*.manus.space` app)
- Pricing route: `$50/mo - 10 posts` or `Immediate menu`
- Kit URL:
- Asset folder:
- Claim check owner: (listing agent — must confirm price/specs)
- Publish lane: `5280.menu`, `Newsletter`, `Social`, `Banner`, `Radio`, `Landing`, `CRM`

Acceptance Criteria:
- Customer-facing estimator mirrored offline and rebranded
- Listing-agent dashboard built (internal — not buyer-linked)
- Email onboarding link exists
- SMS onboarding link exists
- Web preview link exists
- Recommended list price verified against actual property by listing agent
- Comp medians verified against current MLS
- Pricing route is selected
- SATCOM claim check complete
- Publish or schedule action recorded

## Kanban Columns

Ready:
- Intake received
- Source estimator identified
- Market matched to listing kit
- Pricing route selected

Integrate:
- Mirror source SPA offline
- Rebrand to brokerage + listing
- Adopt source brand graphics

Build:
- Showcase + landing page
- Listing-agent CMA dashboard
- Banner set / social card / newsletter block

Copy:
- Sponsored editorial
- SMS
- Email
- Radio/audio
- CRM drip

Review:
- List-price verification (agent)
- Comp verification vs MLS
- Owner approval
- SATCOM final read

Place:
- 5280.menu landing/card
- Newsletter
- Social
- Banner
- Radio/audio

Track:
- Buyer-lead owner
- Published links
- Billing status
- Remaining monthly posts

## Manus Prompt

Integrate the real-estate listing content packet for `[Listing Address]` using
the 240 Deer Rd listing-kit pattern. Mirror the source estimator offline,
rebrand it to the brokerage and listing, adopt the source brand graphics, and
produce a customer-facing showcase plus an internal listing-agent dashboard.
Generate email, SMS, and web onboarding links; include the selected pricing
route; attach or link all assets; and create a kanban card with claim-check,
agent price verification, approval, placement, and tracking steps. Do not
publish a list price, comp figures, or property claims unless the listing agent
verifies them.
