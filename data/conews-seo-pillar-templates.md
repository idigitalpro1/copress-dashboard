# CoNews SEO Pillar Template Pack

Status: PROV-504 build artifact  
Generated: 2026-05-14  
Scope: city news sections, Shop Local, weekly editions, campaign kits

## Canonical Rule

Each town site should feel local first, but use the same editorial spine so SATCOM can scale the rollout without one-off chaos.

Title format:
`{Topic} in {Town}: {Date or Season}`

Meta format:
155 to 160 characters. Lead with the reader action, name the town, and avoid generic "learn more" phrasing.

Minimum internal links:
3 per story, 5 for long-form or sponsor-supported pieces.

## Pillar Templates

| Pillar | URL Patterns | Search Intent | Required Schema | Primary CTA |
|---|---|---|---|---|
| Government | `/gov`, `/municipal-meetings`, `/public-notices` | agendas, budgets, hearings, public decisions | `Article`, `GovernmentOrganization` | subscribe to civic alerts |
| Schools | `/schools`, `/sports/high-school` | board policy, safety, academics, athletics | `Article`, `SportsEvent` | submit score or school tip |
| Shop Local | `/shop`, `/shop/{category}`, `/business/{slug}` | local business discovery, services, sponsors | `LocalBusiness`, `Offer` | claim or upgrade listing |
| Events | `/events`, `/calendar`, `/music` | things to do, concerts, meetings, markets | `Event` | submit event or RSVP |
| Visitor Guide | `/visitor-guide`, `/outdoors`, `/weekend` | travel planning, parking, dining, outdoor guide | `Article`, `TouristAttraction` | plan your visit |
| Features | `/features`, `/investigations`, `/analysis` | long-form reporting and community context | `Article`, `NewsArticle` | support local reporting |
| Local Giving | `/community-giving`, `/go-fund-me`, `/help` | verified fundraisers and local support | `Article`, `DonateAction` | submit verified campaign |
| Opinion / LTO | `/lto`, `/opinion`, `/letters` | letters, corrections, community voices | `Article`, `OpinionNewsArticle` | submit letter |

## Page Module Order

1. H1 and town kicker
2. Local impact summary
3. Verified source block
4. Story body or directory/event module
5. Related town links
6. Shop Local or sponsor module if relevant
7. Submission / subscribe CTA

## Link Rules

- Every story links to its town landing page.
- Every civic story links to an LTO or public comment path.
- Every event story links to at least one Shop Local category when relevant.
- Sponsored links must be labeled `Sponsored`.
- Neighboring town links should only appear when geography or service area makes sense.

## QA Checklist

- H1 contains the town or named venue.
- Title tag contains town plus topic.
- Meta description is unique.
- Canonical URL matches the correct host.
- JSON-LD schema type matches the content type.
- Images have descriptive alt text.
- Public claims include a source block.
- Sponsored content is visibly marked.

## First Implementation Slice

1. Add templates as data source.
2. Expose the data on SATCOM dashboard.
3. Use the pack to drive town landing pages and article stubs.
4. Keep publishing actions separate from template work.
