#!/bin/sh
# Nightly encrypted backup of the vault (values are barrier-encrypted, then age-encrypted again).
set -eu
TS=$(date -u +%Y%m%dT%H%M%SZ); W=/tmp/vault-$TS; mkdir -p "$W"
BAO_TOKEN="$BAO_BACKUP_TOKEN" bao operator raft snapshot save "$W/openbao.snap"
sqlite3 /data/gateway.sqlite ".backup '$W/gateway.sqlite'"
sha256sum "$W"/* > "$W/SHA256SUMS"
tar -C /tmp -czf - "vault-$TS" | age -r "$BACKUP_AGE_RECIPIENT" > "/backups/vault-$TS.tar.gz.age"
rm -rf "$W"
# Retention: keep 30 newest locally
ls -1t /backups/vault-*.age | tail -n +31 | xargs -r rm -f
[ -n "${R2_REMOTE:-}" ] && echo "TODO: push to R2 once GO-2 exists ($R2_REMOTE)" || true
