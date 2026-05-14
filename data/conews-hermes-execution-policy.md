# Hermes Linear Execution Policy Prompt

Status: ready for Linear delivery; Linear connector currently blocked by expired auth  
Generated: 2026-05-14  
Target: CoNews.Press Rollout / SATCOM Sprint 1

## Prompt For Hermes

Hermes, continue the CoNews.Press rollout from the SATCOM Kanban packets.

Execution mode:

- Remove minimum-level stop gates.
- Remove low-level stop gates.
- Remove medium-level stop gates.
- Treat minimum, low, and medium concerns as notes, warnings, or follow-up cards.
- Keep working through the Kanban queue unless a hard review hook is triggered.

Hard review hooks that still stop execution:

- account access changes
- billing, payment, Stripe, bank, invoice, or subscription changes
- Microsoft 365 account/user/license changes
- 3CX live SMS/voice send or phone routing changes
- secrets, tokens, private keys, `.env`, or credential handling
- customer/subscriber data or private CSVs
- DNS, Plesk, SSL, firewall, or domain changes
- destructive filesystem or git operations
- production deploys outside the documented Vercel/dashboard static path
- Sendy or PDF pipeline changes
- any action that externally contacts a person, publishes content, bills a customer, or changes live access

Allowed without stopping:

- static packet generation
- markdown, JSON, CSV, and dashboard data artifacts
- local read-only checks
- local static route checks
- non-secret prompt packets
- SATCOM planning links
- import-ready Linear JSON/CSV payloads
- file-based progress updates

Current priority:

1. Keep PROV-501 through PROV-508 marked as completed/deployed where verified.
2. Prepare the next implementation lane from the deployed artifacts:
   - public town page templates
   - Shop Local seed lists
   - weekly edition renderer
   - contributor intake placement
   - sponsor/advertiser kit placement
3. Keep Linear as the board of record once auth works, but use file-based packets while Linear auth is blocked.

Account review hook format:

When a hard review hook triggers, write:

```text
ACCOUNT REVIEW REQUIRED
Surface:
Requested action:
Why this is gated:
Safe next step:
Files/artifacts affected:
```

Do not execute the gated action until Codex/operator confirms it.

## Linear Comment Target

Preferred issue:
`PROV-508 Add progress monitor card to SATCOM`

Fallback:
`5ST-44 Roll out Kanban-driven news sections and SEO across city sites`

## Linear Comment Body

```markdown
Hermes execution policy update, 2026-05-14:

Minimum, low, and medium concerns should no longer stop the rollout. Treat them as notes, warnings, or follow-up cards and keep moving.

Hard stop/review hooks remain for:

- account access changes
- billing/payment/Stripe/invoice/subscription changes
- Microsoft 365 account/user/license changes
- 3CX live SMS/voice send or routing changes
- secrets/tokens/private keys/.env handling
- customer/subscriber data or private CSVs
- DNS/Plesk/SSL/firewall/domain changes
- destructive filesystem or git operations
- production deploys outside documented Vercel/dashboard static path
- Sendy or PDF pipeline changes
- any external contact, publishing, billing, or live access change

Allowed without stopping:

- static packet generation
- markdown/JSON/CSV/dashboard data artifacts
- read-only checks
- local static route checks
- non-secret prompt packets
- SATCOM planning links
- import-ready Linear payloads
- file-based progress updates

Account review hook format:

ACCOUNT REVIEW REQUIRED
Surface:
Requested action:
Why this is gated:
Safe next step:
Files/artifacts affected:
```
