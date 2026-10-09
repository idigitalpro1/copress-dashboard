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

## Cloud agents: advise vs execute

This is operator working guidance for this public repo. It is **not** a second copy of the locks. The execute document and canonical decisions stay in `idigitalpro1/codex` (`LOCKED_DECISIONS.yaml` and related execute notes). If that private file cannot be read, say so and do not guess a lock. Do not duplicate the YAML here.

On GitHub issues:

- **Advise**: classify the issue, cite evidence, and name the remaining publisher decision. Do not close or invent a lock from chat.
- **Execute**: only the documented, additive change named in the issue or PR when it does not choose a production path or touch a locked surface.

On merge conflicts:

- **Execute** only simple additive conflicts: keep both routes, docs sections, and env tables when they do not choose a production path.
- **Advise / stop** when intents conflict: two review gates, two catalog sources of truth, or any change to `/subscribe`, Stripe, QR, DNS, or prices.
- Previews only. Do not merge to production unless Patrick says **Merge**.
- Record evidence and the remaining publisher decision on the PR. Do not invent a second source of truth here.
