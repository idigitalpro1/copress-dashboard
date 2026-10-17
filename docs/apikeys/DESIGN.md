# SATCOM API key vault (`satcom.conews.press/apikeys`) — DRAFT design

**Status:** DRAFT. Nothing here is deployed. No DNS, server, Coolify or secret change is made by this PR.
**Approved scope:** Patrick approved building the vault first (2026-10-15, before any Plesk moves). Go-live still needs the separate approvals in §9.
**Locks:** LOCK-008 (secrets only in secret stores), LOCK-011 (codex is the only source of truth for key *names*), LOCK-017 (infra steps need a narrow go), LOCK-024 (Hetzner/Coolify host). Proposed new lock: `LOCK-025` (codex).

## 1. Decision: OpenBao behind a small SATCOM gateway

| Option | Verdict |
|---|---|
| **OpenBao** (Linux Foundation fork of HashiCorp Vault, MPL-2.0) | **Chosen.** Proven crypto barrier (AES-256-GCM), KV v2 with versions (rotation history), fine-grained per-path policies and tokens, built-in audit device, Raft snapshots for backup, auto-unseal from a key supplied by env. Single container, ~100 MB RAM. |
| Infisical | Good UI and SDKs, but needs Postgres + Redis, heavier on a shared 16 GB box, and its own login system competes with Clerk/passkey. |
| Vaultwarden | A password manager, not a machine-secret store: no per-bot scoped read tokens or API-first access. Good later for human logins (§11). |
| Custom service | Rejected: we would be writing our own crypto and key handling. |

The SATCOM gateway is thin glue: passkey auth, the `/apikeys` UI API, and the bot read API. **It never does crypto itself**; every secret is stored and encrypted by OpenBao.

## 2. Architecture

```
Browser (Patrick) ── satcom.conews.press/apikeys  (Vercel, static page; Clerk gate already in middleware.js)
      │  fetch() with credentials, CORS locked to https://satcom.conews.press
      ▼
vault.conews.press  (Hetzner 2.29.20.177, Coolify Traefik + Let's Encrypt)
      └─ vault-gateway (Node 22)      ← passkey (WebAuthn) sessions, step-up, audit, bot tokens
             │ private Docker network only (no published port)
             ▼
         openbao (KV v2 at secret/, file audit device, Raft storage on volume)
```

- Vercel holds **no vault credentials**. The page is static; all secret traffic goes browser → Hetzner gateway.
- OpenBao is never exposed publicly. Only the gateway can reach it.
- Two factors to reach the page: Clerk sign-in (existing SATCOM allowlist) **and** a passkey registered on the gateway. The gateway is the real security boundary; Clerk is defence in depth.

## 3. Sign-in: passkey only, Patrick only

- WebAuthn via `@simplewebauthn/server`. RP ID `conews.press`, origin `https://satcom.conews.press`, `userVerification: required` (Face ID / Touch ID / PIN).
- **Single owner:** registration is only possible while (a) zero credentials exist and a one-time `ENROLL_TOKEN` (Coolify secret, deleted after use) is presented, or (b) an existing passkey session does step-up. So no one else can ever register.
- Enroll **at least two** passkeys (iPhone/iCloud Keychain + Mac or a hardware key).
- Session: HttpOnly, Secure, SameSite=Strict cookie, 15 min idle / 8 h max. **Step-up**: reveal, copy, rotate, delete, token issue each need a fresh WebAuthn assertion (≤ 2 min old).
- **Recovery path:** 10 one-time recovery codes generated at first enrollment (shown once, stored as Argon2id hashes). A recovery code allows registering a new passkey only, and revokes all other passkeys and sessions. Print them and keep them with the OpenBao unseal key backup (§7). Last resort: root operator on the Hetzner box rotates `ENROLL_TOKEN` and resets credentials (audit-logged; secrets untouched).

## 4. Encryption at rest and the master key

- OpenBao encrypts everything in its barrier. Auto-unseal uses the **static seal** with the key read from the env var `BAO_SEAL_KEY` (32 random bytes, base64), set only as a Coolify secret. Never in git, never in Vercel. *(Verify the static seal is in the pinned OpenBao release before deploy; fallback is Shamir unseal with keys printed offline.)*
- Gateway's own data (passkey public keys, recovery-code hashes, bot token hashes, audit log) lives in SQLite on a Coolify volume. It contains no secret values.
- OpenBao root token: used once for bootstrap (`scripts/bootstrap.sh`), then revoked. The gateway gets an **orphan periodic token** with only the `satcom-admin` policy (no `sys/` access).

## 5. Features → API

All UI routes require a passkey session; ★ = step-up required. Base `https://vault.conews.press`.

| Action | Route | OpenBao call |
|---|---|---|
| List keys (names + metadata only) | `GET /v1/keys` | `LIST secret/metadata/keys` |
| Add | `POST /v1/keys` `{name, value, service, owner, notes}` | `PUT secret/data/keys/<name>` (cas=0) |
| View ★ | `POST /v1/keys/:name/reveal` | `GET secret/data/keys/<name>` |
| Copy ★ | same as reveal; the browser writes to clipboard and clears it after 30 s | — |
| Rotate | `POST /v1/keys/:name/rotate` ★ `{value}` | new KV version; old versions kept (max 10) |
| Delete ★ | `DELETE /v1/keys/:name` | soft delete latest version; `?destroy=true` destroys all (double confirm) |
| Bot tokens | `GET/POST/DELETE /v1/tokens` ★ | gateway-managed (§6) |
| Audit | `GET /v1/audit?limit=` | gateway SQLite |

Key **names** must match `docs/registry/api-keys.yaml` in codex (e.g. `STRIPE_SECRET_KEY_REGISTERCALL`). The gateway can import that list as empty placeholders, so the registry stays the name catalog and the vault holds values. The registry's `primary_store` field gets the value `satcom-vault` for migrated keys.

## 6. Scoped read-only tokens for bots/apps

- Patrick issues a token per bot (`google-ops`, `telecom`, `codex-factory`, …) with an explicit list of key names, and an optional expiry (default 90 days).
- Token format `svt_<id>_<random>`, shown once; only an Argon2id hash is stored.
- Bot call: `GET /v1/bot/keys/:name` with `Authorization: Bearer svt_…`. The gateway checks the token's allow-list, then reads from OpenBao. Read-only: there's no write route for bots.
- Rate limit 60/min per token; IP allow-list optional per token.
- Revoke instantly from the UI. Every bot read is audited.
- Apps on Coolify can instead keep using Coolify env secrets (LOCK-008 allows both); the vault is the master copy.

## 7. Audit, backup and restore

- **Audit:** gateway writes `{ts, actor (passkey id | token id), action, key name, ip, ua, result}`. It never logs values. OpenBao's file audit device is also on (HMACs values). Audit rows are append-only (SQLite trigger blocks UPDATE/DELETE).
- **Backup (nightly, 03:15 MT):** `bao operator raft snapshot save` + SQLite `.backup` → tar → `age`-encrypted to Patrick's backup public key → Cloudflare R2 `backups/vault/` (once R2 GO-2 exists) and a pull copy to Ace. Retention 30 daily + 12 monthly. Snapshots are already barrier-encrypted; `age` adds a second layer.
- **Restore drill (before go-live, then quarterly):** fresh OpenBao container on a scratch volume with the same `BAO_SEAL_KEY` → `bao operator raft snapshot restore` → gateway on the restored SQLite → verify key count and one placeholder value. Documented in `services/vault-gateway/README.md`.
- **Break-glass kit (offline, printed, Patrick only):** `BAO_SEAL_KEY`, age private key, recovery codes. Without the seal key the backups are useless, by design.

## 8. Hardening

- Coolify: only the gateway gets a domain; OpenBao has no published port. `mlock` capability, read-only root FS where possible, non-root user.
- CSP on `/apikeys`: `connect-src 'self' https://vault.conews.press`; `frame-ancestors 'none'`; `no-store` on all vault responses.
- CORS: only `https://satcom.conews.press`, credentials true.
- Gateway refuses to start if `BAO_SEAL_KEY`/gateway token missing, or if `RP_ORIGIN` isn't https.
- Hetzner firewall stays 22/80/443.

## 9. Go-live checklist (each needs Patrick's go)

1. **DNS:** Cloudflare `A vault.conews.press → 2.29.20.177`, DNS-only (grey cloud) at first. *(DNS change.)*
2. **Coolify:** create the resource from `ops/coolify/apikeys-vault.compose.yaml` on branch `feat/apikeys-vault-draft` (or main after merge); set secrets `BAO_SEAL_KEY`, `ENROLL_TOKEN`, `SESSION_SECRET`, `BACKUP_AGE_RECIPIENT`; deploy. *(Production change.)*
3. Run `scripts/bootstrap.sh` once in the openbao container (init, enable KV v2 + audit, write policy, mint gateway token, revoke root). Paste gateway token into Coolify secret `BAO_GATEWAY_TOKEN`, redeploy.
4. **Passkey enrollment:** open `https://satcom.conews.press/apikeys`, sign in with Clerk, tap "Enroll passkey", paste `ENROLL_TOKEN`, approve Face ID; enroll a second device; save the recovery codes offline. Then delete `ENROLL_TOKEN` from Coolify.
5. Restore drill passes.
6. Only then move keys in, from the Drive `env…md` file, one by one; trash the Drive file after verifying each.
7. Merge the satcom PR (Vercel deploys the static page).

## 10. Risks

- Losing all passkeys **and** recovery codes → root reset on the box (secrets survive). Losing `BAO_SEAL_KEY` **and** the running box → secrets unrecoverable. Mitigation: printed break-glass kit.
- Single Hetzner box: vault down = bots can't read new values (apps that already have Coolify env still run).
- Gateway is new code: keep it small, add tests, review before deploy.
- The Drive keys file holds live keys today; several should be **rotated** at the provider when moved, not just copied.
- WebAuthn RP ID `conews.press` ties passkeys to that domain; changing the domain later means re-enrolling.

## 11. Later

Vaultwarden for human website logins can sit on the same Coolify box. Out of scope here.
