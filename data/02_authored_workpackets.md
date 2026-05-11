# Author Workpackets

**Status:** Editorial-ready  
**Next Phase:** Drafting  
**Boundary:** Planning only. Do not deploy, touch DNS, or publish externally.

---

## 1. Patrick Henry Sweeney

**Lane:** Government, School Board Governance, Investigation  
**Cadence:** 3-5 articles/week

### First 3 Topic Briefs

| # | Topic / Angle | Data Sources to Verify | Editorial Hook |
|---|---------------|------------------------|----------------|
| 1 | `Municipal Budget Breakdown` - Where county/city tax dollars actually go. | County/city council agendas, auditor reports, public records requests. | "We audited the public budget. Here's what the numbers say vs. what they promised." |
| 2 | `School Board Policy Shift` - Curriculum, safety, budget, or zoning changes impacting families. | District board minutes, school board meeting recordings, parent/PTA forums. | "A quiet policy shift changed how [School/District] handles [X]. Parents say it matters." |
| 3 | `Zoning & Development Impact` - How new commercial/residential zoning affects local traffic, schools, and community character. | Planning commission filings, GIS maps, public impact study summaries. | "This development passes zoning. Here's what it means for [Town] infrastructure." |

### Author Lane Rules

- Use on-record sourcing wherever possible. Cross-check municipal filings before publishing.
- Keep bylines verified. Add `@handle` links for public officials if approved.
- LTO moderation: flag potential libel risk before handoff to Codex/Claude for review.

---

## 2. Joathon Weisneth

**Lane:** Shop Local Vertical, Business Profiles, Commerce Editorial  
**Cadence:** 2-4 business features/week

### Shop Local Launch Plan

1. Directory schema live + search index, such as Elasticsearch or Algolia.
2. Category rollouts: `Restaurant`, `Services`, `Retail`, `Professional`, `Outdoor`, `Health`.
3. Map layer: heat map of active businesses by town/category.
4. Admin CRUD for business entries + verification badge workflow.
5. Tier upgrade flow: free -> featured -> rich profile with lead capture and rich media.

### 3 Business Profile Angles

| # | Profile Angle | Local Hook |
|---|---------------|------------|
| 1 | `Startup Story` - First-year small business survival, hiring, customer traffic. | Grounded, verifiable owner quotes + revenue/foot traffic metrics if shared. |
| 2 | `Community Anchor` - 10+ year legacy business, owner lineage, adaptation. | Multi-generational impact, community partnerships, event sponsor roles. |
| 3 | `Seasonal / Tourism Spike` - How seasonal demand changes business operations. | Summer/winter revenue shifts, staffing, supply constraints, local economic impact. |

### Author Lane Rules

- Use verified business stats. No fabricated foot traffic or revenue claims.
- Sponsored profiles labeled `Sponsored` in headline + byline.
- Author discloses partner relationship where applicable.

---

## 3. Paul Hill

**Lane:** High School Sports, Events Calendar, Visitor Guide, Local Giving  
**Cadence:** Daily sports notes, 2-3 event features/week

### Sports Plan

- Weekly high school scores/standings table + player/coach quotes.
- Photo gallery embed from school-verified or approved media.
- Rivalry preview + recap series with seasonal arcs.

### Events Calendar Plan

- Weekly calendar pull: concerts, markets, board meetings, town halls.
- Map-pin layout + RSVP integration.
- Sponsor-pinned events module.

### Photo/Video Needs

- Contributor API upload for JPG, PNG, WAV, and MP4 with moderation queue.
- Image alt schema enforcement: `location-noun-verb.jpg`.
- Video player embed + sponsored overlay slot.

### Local Giving

- Aggregation feed API or manual submission with verification badge.
- Campaign cards with progress bar, donation link, update posts.
- Sponsored campaign spotlight for paid tier.

### Author Lane Rules

- Verify high school league standings before publishing. Cross-check school media room.
- RSVP/capacity rules enforced by calendar system with real-time counts.
- Donations processed via partner API, never manual collection.
