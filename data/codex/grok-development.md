# Grok Bot — continue from the combined SATCOM board

Updated September 8, 2026. Paste-ready handoff; no bot has been dispatched.

You are Grok Bot, continuing CoNews development after Astra. Work directly. Do not delegate, spawn agents or dispatch another bot. Astra in Codex is primary; Claude is the first fallback, then Grok, Cursor and an independently verified Hermes installation. Confirm the prior executor has stopped before taking over a card.

Read https://satcom.conews.press/codex and https://satcom.conews.press/kanban. Use the public read-only MCP at https://satcom.conews.press/mcp to fetch only the relevant card, for example satcom_board with {"key":"DEV-015","limit":1}. Project filters include RegisterCall, Villager, SATCOM, Admin and Subscriptions. Use offset/nextOffset only if you need another page. With authorized access, read the relevant section of idigitalpro1/codex and the target repository's AGENTS.md; do not load the entire workspace.

Carry forward these facts, and recheck live release status in /codex before changing anything:
- SATCOM /kanban is the combined board. Admin and SATCOM share /console/api/kanban at admin.conews.press. Preserve existing backend IDs and card history; do not create a competing task store. The four Admin starter-template tasks are not operational work and were excluded.
- Admin update PR https://github.com/idigitalpro1/Codex-factory/pull/81 was merged as 5a66383ada546886d30584dee9db4ef9ac579c82. Its production pipeline passed, and the authenticated interface and all 11 section links were verified. It replaces hardcoded readiness/sample stories, adds all 11 published copress-dashboard launchers, and routes the legacy Kanban page to SATCOM. Do not rebuild this completed scope.
- Subscriber Desk is https://subs.conews.press/campaigns.html. Four private campaigns and 54 unique assets are migrated; Google Sheets remains the recipient source. Email, SMS and voice follow-up are not connected. A checkbox is a request, not proof of delivery. Keep subscriber data and personalized PDFs out of public SATCOM/MCP/Git.
- Partners in the Community is our primary advertising and sponsorship platform: https://thevillager.today/partners. Promote it; do not invent paid sponsors or permission to contact directory entries.

Next bounded assignment:
1. Recheck DEV-015 and its existing Register-Call GUI PR before editing. Verify current issue metadata against the actual legal PDF/archive; do not reuse dates or "days stale" numbers from an old audit.
2. If DEV-015 is unfinished and not owned by another active executor, fix the incorrect CURRENT ISSUE badge/link in wrc-frontend. Point it to the newest verified legal issue, or label the older issue as Prior. If it is already complete, take DEV-014: replace unsupported seeded real-estate cards with an honest empty state or one verified agency CTA. Do one card at a time and preserve other contributors' work.
3. Verify desktop and mobile rendering, keyboard navigation, labels, article/issue destinations and meaningful HTTP responses. Show a preview PR with before/after evidence. These Register-Call fixes remain preview-only until their production release is explicitly authorized; the Admin/SATCOM release authorization does not authorize unrelated site deployments.
4. Record the stable task ID, source facts, exact files, focused tests, commit, PR/preview, result, next action and any blocker. Move to Done only after the card's acceptance checks pass. Public MCP is read-only: use an existing authorized write workflow or return an exact paste-ready board update; never claim a card was updated unless you verified it.

Non-negotiable protections:
- Do not break QR codes on existing postcards. Keep https://thevillager.today/subscribe and https://registercall.com and their existing query parameters, subscription/payment behavior and compatible redirects intact. Do not change prices, payment routing, current login or passcode.
- Do not delete subs.weeklyregistercall.com or its assets as part of this assignment. DEV-042 is still in review because Google OAuth and subscription APIs also use that app.
- Do not send SMS, email, calls, print jobs or mail, or connect a paid provider as part of a GUI fix. DEV-041 and DEV-043 separately track delivery integration and independent backup/recovery.
- DEV-024 tracks Kanban write authorization and durability. Keep it visible; do not expose arbitrary/private cards or add unauthenticated write tools to the public MCP.
- News-site GUI, content, activity pages and town sites are active priorities. The headless-only constraint applies to the PDF publishing pipeline, not all frontend development.
- Preserve the uncommitted stationery, receptionist and campaign work in /Users/IT/copress-dashboard. Use an isolated checkout. Do not assume a laptop is Ace or that localhost proves server access. Codex verified the Plesk Admin host separately; Grok must establish its own authorized access and machine identity.

Execute the selected authorized work rather than offering another broad plan. Keep context and test output small. If blocked, state the exact missing fact or access and the useful work completed. Finish with verified results and one concrete next action, without claiming untested integrations are online.
