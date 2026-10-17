# Gateway token policy: keys only, no sys/ access.
path "secret/data/keys/*"     { capabilities = ["create", "read", "update"] }
path "secret/metadata/keys/*" { capabilities = ["read", "list", "delete"] }
path "secret/metadata/keys"   { capabilities = ["list"] }
path "secret/delete/keys/*"   { capabilities = ["update"] }
path "secret/destroy/keys/*"  { capabilities = ["update"] }
