# WRC Billing Escalation for Patrick

Captured: 2026-05-14 12:29 MDT
Priority: P0/P1 billing operations blocker

## Operator Report

Please make sure Patrick sees this:

1. Invoices are NOT going out with links.
2. I can't change emails.
3. Invoice shows as DRAFT and not finalized.
4. I have no clue what has been sent out or not, so I started keeping a SEPARATE sheet to keep track.
5. I still can't get into WRC in Dumb Books.

## Why This Needs Immediate Attention

- Payment collection may be blocked if invoices are missing links.
- Customer contact corrections are blocked if invoice/customer emails cannot be changed.
- Draft/finalized state is unclear, so operators cannot trust whether an invoice is live.
- Sent/not-sent visibility is missing, forcing manual shadow tracking in a separate spreadsheet.
- WRC QuickBooks access is still blocked, so accounting reconciliation cannot be trusted.

## Surfaces To Check

- Invoice manager: `invoicemanager.weeklyregistercall.com`
- Admin billing surface: `admin.conews.press/console/en/invoice-list`
- QuickBooks / WRC company access
- Invoice email sender and payment-link generation path

## Active Contact / Accounting Context

- Becky Osterwald — `legal@villagerpublishing.com` — Active.
- Digital invoicing lane: `admin@registercall.com`.
- Print invoicing lane: `news@weeklyregistercall.com`.
- Accounting target: `registercall.com` syncs into the `myappstore.biz` online accountant suite.
- Weekly Register-Call is the QuickBooks/accounting sub-account for paid print and print+digital work.
- Custom Intuit app must preserve product-code splits for print vs digital, even when customer-facing billing is combined.

## First Debug Pass

1. Create or select one test WRC invoice.
2. Confirm whether the send action includes a customer-facing payment/claim link.
3. Confirm the invoice status transition from draft to finalized/sent.
4. Confirm whether customer email can be edited before send.
5. Confirm the UI exposes a sent/not-sent audit trail operators can trust.
6. Re-check the QuickBooks connection for the WRC company after the Intuit app redirect URI is fixed.

## QuickBooks OAuth Blocker Captured

- Chrome is logged into QuickBooks as Patrick and selected the Weekly Register-Call company.
- Backend OAuth launch reaches Intuit for the app named `RegisterCall Billing`.
- Intuit blocks the connect flow before approval with:
  - `The redirect_uri query parameter value is invalid. Make sure it is listed in the Redirect URIs section on your app's keys tab and matches it exactly.`
- Exact redirect URI currently sent by the backend:
  - `https://billing.weeklyregistercall.com/api/v1/quickbooks/oauth/callback`
- Required operator fix:
  - Sign into Intuit App Center / Intuit Developer with the account that owns the `RegisterCall Billing` app. The QuickBooks company login alone is not enough for this setting.
  - In that Intuit Developer app, add the exact URI above to the production Redirect URIs allowlist, then retry the QuickBooks connect flow for Weekly Register-Call.
