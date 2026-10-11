# Subscription conversion integration

Open SATCOM at `/#conversion` to land in the existing Marketing Hub conversion panel.
CoNews navigation and Clerk authentication remain in place. SATCOM prepares shared
campaigns; Invoice Manager remains the financial engine. The canonical 2026
Google Sheet and Campaign_Log remain authoritative. Stripe-to-Sheet is manual.

The three draft concepts are Villager publisher Hall of Fame, Villager high-school
sports, and unapproved Villager/WRC brand pairing. Pairing supports separate
publication selection; it never infers a joint paid product. No rate or expiration
defaults are carried from Postcard Studio.

## Operator behavior

Choose a concept, publication and email, picture-text or dedicated QR option.
Email opens the existing `copress_campaign_handoff` → `/newsletter?campaign=latest`
workflow with publication-specific subscription copy and live-text buttons.
Picture-text and QR show the exact subscription link and artwork availability,
then export a draft specification. No QR is re-encoded or substituted.

The enrollment action is explicitly unavailable. Channel opt-in is a local draft
assertion, never consent evidence. Selecting a link creates no subscriber record
and verifies no paid status. There is no new contact collector, enrollment request,
workflow activation, billing mutation, campaign send or Sheet write.

## Adapter contract and next production integration

`SubscriptionCampaigns.conversionHandoff(draft, channel, consent)` returns version 1
with campaign/publication/channel, exact campaign_url, consent requirements,
enrollment status, subscriber_record, paid_status and delivery status.
It always returns unavailable enrollment, enrolled:false and sent:false.
contact_ref, workflow_ref and consent evidence_ref remain null.

The next integration is an authenticated server adapter to the existing
SATCOM/HubSpot workflow: resolve an approved contact reference, verify persisted
channel opt-in and evidence, validate an approved publication-to-workflow mapping,
and return provider-confirmed enrollment status with an idempotency key.
Do not treat link clicks, draft consent checkboxes or exports as enrollment,
payment, or canonical Sheet updates. Configure existing authorized infrastructure
and review those mappings before enabling the action. This checkout has no
HubSpot enrollment route or client integration; no live capability is claimed.

## Artwork blockers

READY_TO_REVIEW.zip was resolved through Library and prepared into a consumer-local
directory. The current Library transfer helper failed to download bytes after the
bounded explicit-destination preparation. No bytes or pixels were available for
inspection; no package member names or image URLs were invented. The registry
retains the package reference with member:null and blocked-transfer-uninspected.
No private photo is committed or publicly hosted.

Materialize and inspect that package before attaching specific local artwork
references. Sports requires an approved real photo. Brand pairing and return
address require approval. Mailed postcards require 4×6-inch proofs and print
bleed; the current draft contract has no bleed. Picture-message art must be
vertical with the exact QR destination and accompanying clickable URL. Email
sender and unsubscribe tokens still require the existing provider integration.

Postcard Studio source was inspected read-only:
`frontend/admin-spa/src/pages/PostcardStudioPage.jsx` blob
`250ab681aacd1ed77e0e56461f8ee1097e292c98` and
`backend/app/routes/postcards.py` blob
`ebea49dae19cdf6e528445632fb54663f0a83d8e`.
Its publication/art/size/page_size/renew_url/tagline/default_note/print_side
contract is reused as draft metadata; no second renderer was built.

## Verification and release

Canonical LOCKED_DECISIONS.yaml version 1, blob SHA
`0e1c8fddd8f3387c5dbe358ba4d75cdff8822f8a`, was read through authenticated
GitHub. The named `ops/2026-10-10-hq-billing-satcom-consolidation.md` returned 404;
the supplied architecture was followed without fabricating its content.
Checkout `.agents/skills` and workspace `.agents/skills` were absent.

`npm test`: 190 passed. `npm run build`: passed. Chromium verified the real
Marketing Hub email/picture-text/QR draft flow, both publication subscription
CTAs, legacy Villager readmore mapping, visible missing-sports-photo blocker,
and unavailable enrollment. Local browser tests used the existing local operator
gate action; production authentication was not bypassed.

Verified production project: Vercel `copress-dashboard`,
`prj_khskg2gU0jLL3Y5j3OJxE9q1znkN`, team `5280menu`
(`team_yXUiLQXJG67i2CBkEhLAhE8V`). Starting production revision
`259a25742c81aba64939f82e63e32596be75fe7e` matched the checkout.
Rollback target: `dpl_5tiyTdwxEGkXTPVuc3AQ1WiUmeR2`
(`copress-dashboard-3mdrlro3q-5280menu.vercel.app`).

This feature is isolated on `build/subscription-campaign-drafts`; main is not
merged. A release must deploy this exact tested branch revision, inspect the
preview, recheck overlapping production work, then promote only this app's build.
