# 240 Deer Rd — CRM Drip Sequence

Trigger: buyer submits contact info from the customer-facing estimator.

| # | Timing | Channel | Subject / Hook | Goal |
|---|--------|---------|----------------|------|
| 1 | Immediate | Email | "Your 240 Deer Rd estimate" — recap their inputs + estimate | Confirm, build trust |
| 2 | +1 day | Email | "How Gilpin County sub-markets compare" — comp context | Educate |
| 3 | +3 days | SMS | "Want to walk 240 Deer Rd? Pick a time." | Book showing |
| 4 | +7 days | Email | "Q1 2026 market note for Gilpin County" | Stay top-of-mind |
| 5 | +14 days | Email + SMS | "Still considering 240 Deer Rd? Your agent is ready." | Re-engage / handoff |

## Rules
- Stop sequence on reply or showing booked → hand to listing agent.
- Never quote a final list price in drip copy; link to the estimator instead.
- All sends respect CoNewsPress / HipCribs unsubscribe + consent.
- Lead routes into the listing-agent dashboard pipeline (Inquiry → Qualified →
  Showing → Offer).
