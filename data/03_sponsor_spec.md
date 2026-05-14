# Sponsor / Ad Carousel Spec

**Status:** Technical spec  
**Lane:** Design + Codex/Claude Implementation  
**Boundary:** Planning only. No code, no deploy.

---

## 1. Free-Tier Banner Density

| Placement | Dimensions | Behavior |
|-----------|------------|----------|
| Top rail | 728x90 | Static or rotative, up to 2 ad sets. |
| Sidebar sticky | 300x600 | Sticky to viewport until scroll past main editorial. |
| Inline native | 640x200 | Injected between H2/H3 blocks. |
| Shop Local / Event pins | Responsive | Sponsored pin overlays on map/calendar. |

**Density Rule:** Max viewport exposure <= 40%. No ad overlap with H1/H2 text.

---

## 2. Paid-Tier Sponsored Carousel

- **Component:** Swipeable/draggable carousel with touch + mouse support.
- **Rotation:** 24-48h minimum refresh. Auto-loop allowed.
- **Labeling:** `Sponsored` in subheader + small CTA button.
- **Placement:** Below H1/H2, after intro paragraphs, above inline body ads.
- **Content:** Local business profiles, event promotions, community giving pushes.
- **Click Tracking:** Event tracking for `carousel:impress`, `carousel:click`, and `sponsored:cta`.

---

## 3. Square Ad Modules

| Size | Location | Behavior |
|------|----------|----------|
| 250x250 | Inline within editorial content, 2-3 per long post | Sticky on scroll until scrolled past. |
| 300x250 | Shop Local category headers | Rotative per session. |

---

## 4. Tracking Events

Track these events via analytics or tag manager:

- `ad:impress_viewport` - Banner/module enters viewport > 50%.
- `ad:click` - CTA/button or card click.
- `carousel:swipe` - Swipe event + index.
- `carousel:cta` - Carousel card CTA click.
- `conversion:newsletter_submit` - Newsletter opt-in.
- `conversion:sponsor_lead` - Sponsor form submit.
- `conversion:shop_local_inquiry` - Directory inquiry.
- `conversion:rsvp_submit` - RSVP confirm.

---

## 5. Acceptance Criteria for Codex/Claude Implementation

1. `PROV-203` - `GET /ads/placement` returns correct module per tier, `free` or `paid`.
2. `PROV-204` - Carousel rotates <= 24h, tracks swipe/CTA events, and is labeled `Sponsored`.
3. `PROV-303` - Ad viewport <= 40%, and Core Web Vitals are not penalized by ad modules.
4. `PROV-304` - All tracking events fire correctly; dashboard shows funnel metrics for newsletter, sponsor leads, and Shop Local inquiries.
5. `PROV-305` - Soft launch to 1-2 pilot towns, capture feedback, then hard launch.
