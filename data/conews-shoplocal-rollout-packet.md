# Shop Local Rollout Packet

Status: Buildout-ready planning packet
Goal: Turn each town site into a searchable local business and sponsor surface.

## Core Categories

| Category | Example Businesses | Starter Fields | Sponsor Fit |
|---|---|---|---|
| Dining | restaurants, coffee, bars, bakeries | menu URL, hours, reservation link, dietary tags | featured profile, weekly special |
| Outdoor | outfitters, guides, rentals, trail services | activity type, season, booking link, safety notes | trip package, gear spotlight |
| Lodging | hotels, cabins, campgrounds, B&Bs | amenities, pet policy, booking link, map pin | weekend package |
| Retail | boutiques, galleries, gift shops | product categories, local maker tags, online shop | product carousel |
| Professional | legal, accounting, real estate, insurance | license notes, service area, consultation CTA | lead form |
| Health | clinics, wellness, fitness, dental | appointment link, accepted insurance, services | sponsor card |
| Entertainment | venues, casinos, tours, museums | event schedule, tickets, age restrictions | event sponsor |
| Services | contractors, automotive, home, repair | emergency hours, service area, quote CTA | directory upgrade |

## Directory Fields

Required:
- business_name
- town
- category
- short_description
- address
- phone
- website
- contact_email
- verification_status
- tier

Optional:
- logo
- hero_image
- gallery
- menu_url
- booking_url
- social_links
- hours
- latitude
- longitude
- sponsor_start
- sponsor_end
- tracking_slug
- editorial_notes

## Tier Model

| Tier | Name | Included |
|---|---|---|
| Free | Basic Listing | name, category, town, website, phone |
| Featured | Shop Local Feature | logo, hero image, short profile, map pin, CTA |
| Sponsor | Sponsor Placement | carousel card, newsletter mention, analytics, category boost |
| Partner | Rich Profile | video, lead form, campaign page, priority editorial review |

## Launch Workflow

1. Seed each pilot town with known businesses from public sources.
2. Mark every unverified listing as `needs verification`.
3. Send onboarding link to businesses for profile claim.
4. Joathon reviews commerce copy and sponsor labels.
5. Codex/Claude wires fields into SATCOM/dashboard only after review.

## Acceptance Criteria

- Each pilot town has at least 20 candidate listings or a clear research block.
- Sponsored listings are labeled.
- No fabricated reviews, hours, pricing, or revenue claims.
- Every CTA has a tracking slug.
- Directory fields can export to CSV and JSON.

