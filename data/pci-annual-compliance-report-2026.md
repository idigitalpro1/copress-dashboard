# Annual PCI Compliance Readiness Report

Reporting year: 2026
Prepared for: SATCOM / CoNews / myappstore.biz operator review
Prepared on: 2026-06-30
Reference standard: PCI DSS v4.0.1
Status: internal readiness report, not an attestation

## Important Limitation

This packet is an internal annual readiness report. It is not a PCI Report on
Compliance, Attestation of Compliance, or Self-Assessment Questionnaire. Final
PCI validation must be completed through the correct acquiring-bank, payment
processor, SAQ, QSA, or approved scanning workflow.

## Scope Summary

Known SATCOM/payment-adjacent surfaces:

| Surface | Current role | PCI posture |
|---|---|---|
| `myappstore.biz /pci/` | PCI compliance dashboard route referenced by the eleven-labs PCI app | Internal reporting/admin surface |
| `5280.menu /invoice/` | Invoice/payment workflow reference in repo docs | Needs payment-flow verification |
| Stripe / payment links | Billing and subscription pathway referenced by SATCOM docs | Prefer hosted/payment-link flow; do not store PAN locally |
| SATCOM API Vault | Browser-local operator key reference | Not a PCI card-data store |
| Sendy / subscriber systems | Email and renewal campaign systems | Keep separate from cardholder data environment |

Assumption for review: local systems should not store full primary account
numbers, CVV, magnetic-stripe data, PIN data, or payment-card screenshots. Any
exception must be treated as a critical scope expansion.

## Executive Readiness Statement

SATCOM should treat PCI as an annual operating control, not a one-time page.
The preferred architecture is to keep cardholder data out of SATCOM, Sendy,
Hermes, Open WebUI, CSV imports, and local campaign-kit workflows by using
hosted payment providers and payment links.

Readiness rating: `needs operator evidence`

Reason: the static docs and PCI dashboard route exist, but the annual evidence
packet still needs current payment-flow screenshots, processor settings, user
access review, scan evidence where applicable, and confirmation that no local
workflow stores cardholder data.

## PCI DSS v4.0.1 Control Areas

| Area | SATCOM expectation | 2026 evidence needed | Status |
|---|---|---|---|
| Network security controls | Keep production ports minimal; do not expose internal ports publicly | Firewall/Plesk/Lightsail screenshot or exported rule summary | Needs evidence |
| Secure configuration | Harden hosting, admin, and deployment settings | Server/app config review summary; no default credentials | Needs evidence |
| Stored account data | Avoid storing cardholder data in SATCOM/local apps | Operator statement plus repo/storage search for PAN-like data | Needs evidence |
| Transmission security | HTTPS for public payment/admin routes | TLS checks for payment-facing domains | Needs evidence |
| Malware and endpoint protection | Protect operator machine and server surfaces | Endpoint/server protection status | Needs evidence |
| Secure systems and software | Keep app dependencies and static deploys reviewed | Build/test evidence; dependency review for payment app | Needs evidence |
| Access by business need | Limit payment/admin access to required users | User/access list review | Needs evidence |
| User identification and authentication | Unique accounts and MFA for payment/admin systems | GitHub, Vercel, Stripe, M365, Plesk MFA/access review | Needs evidence |
| Physical access | Keep physical/payment devices out of scope or documented | If no card-present devices, record "not applicable" rationale | Needs evidence |
| Logging and monitoring | Track admin/payment-relevant access | Payment provider logs and hosting audit log notes | Needs evidence |
| Security testing | Run scans/tests appropriate to scope | Vulnerability scan or ASV evidence if required | Needs evidence |
| Security policy | Maintain annual PCI operating policy | This packet plus operator sign-off and hard-review hooks | Drafted |

## Evidence Checklist

Collect these before marking the annual report complete:

- Current payment flow description: hosted checkout, payment link, invoice link,
  terminal, or other.
- Confirmation of SAQ type from processor/acquirer.
- Screenshot or export of payment provider PCI/compliance dashboard.
- Confirmation that no SATCOM, Sendy, Hermes, Open WebUI, or campaign-kit
  workflow stores full PAN/CVV/sensitive authentication data.
- Current public HTTPS check for payment-facing domains.
- Access review for Stripe/payment provider, Vercel, GitHub, Plesk, M365, and
  any invoice admin.
- MFA status for privileged accounts.
- Server/network firewall summary if any payment-facing route is self-hosted.
- Dependency/build evidence for the PCI dashboard or invoice app.
- Incident-response contact and escalation owner.
- Operator sign-off date.

## SATCOM Guardrails

- Do not paste payment-card data into Hermes, Open WebUI, Codex, Claude, Sendy,
  CSV files, prompts, screenshots, or issue trackers.
- Do not commit PCI evidence containing customer data, cards, secrets, tokens,
  private keys, or account screenshots.
- Do not treat API Vault as a credential source for payment-card operations.
- Do not let campaign kits, renewal proofs, or subscriber workflows mix with
  cardholder data.
- Keep Sendy and subscriber renewal lanes separate from payment-card evidence.
- Any live payment, subscription, billing, or account-access change requires
  operator approval.

## Annual Workflow

1. Confirm current PCI DSS and SAQ version with PCI SSC and the payment
   processor.
2. Identify the correct SAQ or validation path.
3. Verify payment flow keeps cardholder data out of local systems.
4. Collect evidence listed above.
5. Review open blockers and remediation items.
6. Store only sanitized evidence summaries in SATCOM.
7. Complete processor/acquirer SAQ/AOC workflow outside SATCOM.
8. Record final operator sign-off in a private evidence location.

## Open Blockers

| Blocker | Why it matters | Safe next action |
|---|---|---|
| SAQ type not confirmed | Determines exact validation requirements | Check Stripe/processor PCI dashboard or acquiring bank instructions |
| Payment-flow scope not freshly mapped | Scope decides whether local systems are in the cardholder data environment | Document current checkout/invoice flow with screenshots that do not expose customer data |
| Access review not attached | Privileged account drift is a recurring PCI risk | Export or manually list current admins in a private evidence packet |
| Scan requirement unknown | Some flows require quarterly ASV or vulnerability evidence | Confirm processor/acquirer requirement |

## Operator Sign-Off

Report owner:

Reviewer:

Final SAQ/processor validation path:

Evidence location:

Sign-off date:
