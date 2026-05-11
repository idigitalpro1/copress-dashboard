# Digital Weekly Delivery Engine

**Status:** Planning-ready  
**Lane:** Register Call / CoPress digital weekly  
**Boundary:** Planning only. Do not deploy, touch DNS, send email, or modify subscriber data.

---

## Concept

The Weekly Register Call becomes a hyperlocal digital weekly: one mobile-native edition per town, assembled Thursday evening and ready for Friday morning readers.

It should feel like a local newspaper in mobile format:

- Front page: headliner + 3 follow-ups
- Shop Local spotlight
- High school sports recap
- Calendar of events and meeting notices
- One community letter or op-ed
- Sponsor carousel and paid placements

---

## Delivery Flow

```text
Community submits article -> Moderation Queue
Author drafts story -> Editorial Queue
Business submits Shop Local profile -> Verification Queue
Thursday 6PM -> build_edition.py assembles town edition
Friday 6AM -> email delivery and PWA/web edition available
Reader opens edition -> reads, clicks Shop Local, RSVP, sponsor CTA
```

---

## New Kanban Cards

| Issue | Title | Priority |
|---|---|---|
| `PROV-401` | Subscriber Preference API | High |
| `PROV-402` | Weekly Edition Build Engine | High |
| `PROV-403` | Community Submission Forms | High |
| `PROV-404` | Shop Local Business Onboarding | Medium |
| `PROV-405` | Town Subscriber Landing Pages | Medium |
| `PROV-406` | SMTP Delivery and Schedule | High |
| `PROV-407` | Subscriber and Sponsor Analytics | Medium |

---

## Recommended Pilot

Start with two towns:

1. Morrison / Red Rocks
2. Nederland

Keep the pilot scoped to:

- subscriber signup
- weekly edition page
- editorial queue
- Shop Local intake
- one sponsor carousel placement
- analytics smoke checks

---

## Implementation Guardrails

- Do not send live email until test mode and unsubscribe are verified.
- Do not import customer/subscriber data without explicit approval.
- Keep initial database small and migratable: SQLite for prototype, PostgreSQL for production.
- Keep town edition generation deterministic: approved content in, edition payload out.
- Every edition must preserve canonical URLs and SEO metadata.

---

## Next Aileen Task

Create a sample first issue for the Morrison / Red Rocks pilot.

Return:

1. front-page headline package
2. three follow-up story slots
3. Shop Local spotlight idea
4. sports/events slot
5. calendar/notices slot
6. community letter/op-ed prompt
7. sponsor carousel examples
8. SEO title and meta description
9. NEEDS RESEARCH list
