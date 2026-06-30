# Idaho Springs CRM Staging Import - 2026-06-30

This is an import-prep artifact only. It is safe for CRM staging/review queues and unsafe for live CRM writes until the operator explicitly approves the target CRM and credential.

Machine CSV: https://satcom.5280.menu/data/idaho-springs-crm-staging-import-2026-06-30.csv
Follow-up tasks: https://satcom.5280.menu/data/idaho-springs-crm-followup-tasks-2026-06-30.json
Source packet: https://satcom.5280.menu/data/idaho-springs-crm-integration-packet-2026-06-30.json

## Import Gate

- Send status must remain `do_not_send`.
- CRM write status must remain `blocked_until_operator_approval`.
- Missing contact and artwork fields must be resolved before any owner outreach.
- Compliance review is required before any casino, pharmacy/grocery, wellness, price, promotion, rate, availability, or time-sensitive claim.

## Records

| Lead ID | Company | Priority | CRM Write Status | Send Status | Missing Fields |
|---|---|---|---|---|---|
| `ricks-gondola-project` | Rick's Gondola Project | Hot | blocked_until_operator_approval | do_not_send | contactName, contactPhone, contactEmail, website, imagePath |
| `mtn-prime-steakhouse` | MTN Prime Steakhouse | Hot | blocked_until_operator_approval | do_not_send | contactName, contactPhone, contactEmail, website, imagePath |
| `safeway-idaho-springs` | Safeway Idaho Springs | Active | blocked_until_operator_approval | do_not_send | contactName, contactPhone, contactEmail, website, imagePath |
| `indian-hot-springs` | Indian Hot Springs | Hot | blocked_until_operator_approval | do_not_send | contactName, contactPhone, contactEmail, website, imagePath |
| `maverick-casino` | Maverick Casino | Active | blocked_until_operator_approval | do_not_send | contactName, contactPhone, contactEmail, website, imagePath |

## Safe Execution Result

Generated staging CSV and follow-up task JSON from the existing SATCOM CRM packet. No CRM API was called. No SMS or email was sent. No credentials were requested.
