# AGENTS.md

Instructions for Codex and other coding agents working in idigitalpro1/copress-dashboard.

<!-- LOCKED-DECISIONS-BOOT: keep this section at the top. Source: idigitalpro1/codex LOCKED_DECISIONS.yaml -->
## Locked decisions: read before any work

Before doing anything in this repo, fetch and follow the canonical locks:

- https://github.com/idigitalpro1/codex/blob/main/LOCKED_DECISIONS.yaml
- raw: https://raw.githubusercontent.com/idigitalpro1/codex/main/LOCKED_DECISIONS.yaml
- The codex repo is private, so read it with an authenticated GitHub connection, for example
  `gh api repos/idigitalpro1/codex/contents/LOCKED_DECISIONS.yaml -H "Accept: application/vnd.github.raw"`.

Cite the file's `version` (and the git SHA you read) in your PR, commit, or report. That YAML
is the only copy of the locks. If this file, a chat thread, or your memory disagrees with it,
the YAML wins. Locks change only through a PR in idigitalpro1/codex that Patrick approves. If
you can't read it, say so and stop before any risky action. Don't guess.

The five hardest locks (a summary; the YAML is authoritative):

1. No QR code, /subscribe, Stripe routing, DNS, or price changes without Patrick's explicit approval.
2. Drafts only. Patrick sends. Nothing is sent, posted, or bought in his name without his go.
3. Previews before production.
4. No secrets in chat, issues, PRs, logs, or git. Use secret stores only.
5. No private medical information in public places, group chats, or repos.
<!-- /LOCKED-DECISIONS-BOOT -->
