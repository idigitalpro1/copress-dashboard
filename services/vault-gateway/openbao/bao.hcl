ui = false
disable_mlock = false
storage "raft" {
  path    = "/openbao/data"
  node_id = "satcom-vault-1"
}
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true   # private Docker network only; never published
}
api_addr     = "http://openbao:8200"
cluster_addr = "http://openbao:8201"
# Auto-unseal from Coolify secret env var BAO_SEAL_KEY (verify against pinned release docs).
seal "static" {
  current_key_id = "satcom-2026-10"
  current_key    = "env://BAO_SEAL_KEY"
}
