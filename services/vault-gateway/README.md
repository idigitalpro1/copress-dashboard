# vault-gateway (DRAFT, not deployed)

Passkey-only gateway in front of OpenBao for `satcom.conews.press/apikeys`. Design: [`docs/apikeys/DESIGN.md`](../../docs/apikeys/DESIGN.md). Compose: [`ops/coolify/apikeys-vault.compose.yaml`](../../ops/coolify/apikeys-vault.compose.yaml).

- `src/server.js`: routes (WebAuthn, keys, bot tokens, audit). `src/bao.js`: OpenBao KV v2 client. `src/db.js`: SQLite (no secret values). `src/scopes.js`: pure helpers.
- `openbao/`: server config and policies. `scripts/bootstrap.sh`: one-time init (operator, after go). `backup.sh` + `crontab`: nightly encrypted backup.
- Tests: `npm install && npm test` (helpers only; integration test against a throwaway OpenBao dev container is a TODO before deploy).

## Restore drill
1. New scratch volumes; start `openbao` with the **same** `BAO_SEAL_KEY`.
2. `age -d -i <offline key> vault-<ts>.tar.gz.age | tar xz`; check `SHA256SUMS`.
3. `bao operator raft snapshot restore -force openbao.snap` (with a recovery-key-generated root token, revoked after).
4. Point a scratch gateway at the restored `gateway.sqlite`; verify key count and audit tail. Tear down.

## Bot usage
```sh
curl -s -H "Authorization: Bearer $SATCOM_VAULT_TOKEN" https://vault.conews.press/v1/bot/keys/CLOUDINARY_API_KEY
```
