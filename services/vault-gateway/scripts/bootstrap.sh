#!/bin/sh
# One-time bootstrap, run by the operator inside the openbao container AFTER Patrick's go.
# Prints the root token and recovery keys ONCE to the operator's terminal. Never paste them in chat or git.
set -eu
export BAO_ADDR=http://127.0.0.1:8200
bao operator init -recovery-shares=3 -recovery-threshold=2 > /tmp/init.txt
echo "Copy the recovery keys and root token from /tmp/init.txt to the offline break-glass kit, then press Enter."; read _
export BAO_TOKEN="$(sed -n 's/^Initial Root Token: //p' /tmp/init.txt)"
shred -u /tmp/init.txt 2>/dev/null || rm -f /tmp/init.txt
bao secrets enable -path=secret -version=2 kv
bao write secret/config max_versions=10
bao audit enable file file_path=/openbao/audit/audit.log
bao policy write satcom-admin /openbao/config/satcom-admin.hcl
bao policy write satcom-backup /openbao/config/satcom-backup.hcl
echo "Gateway token (put in Coolify secret BAO_GATEWAY_TOKEN):"
bao token create -orphan -policy=satcom-admin -period=768h -field=token
echo "Backup token (put in Coolify secret BAO_BACKUP_TOKEN):"
bao token create -orphan -policy=satcom-backup -period=768h -field=token
bao token revoke -self
echo "Root token revoked. Done."
