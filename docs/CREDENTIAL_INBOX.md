# SATCOM credential intake

## Implementation status

The existing `/apistore` links to `/credential-inbox`. This new, isolated page accepts copied text, raw keys, dotenv text, and JSON files up to 64 KB. Original text is encrypted with AES-256-GCM before writing an immutable record to a **private** Vercel Blob store. Records use UUID paths and authenticated encryption binds each payload to its ID. Metadata is also encrypted at rest. The authenticated inventory decrypts metadata on the server without returning raw credentials. Recovery downloads one chosen original record. Unknown credentials are saved unassigned. No LLM receives credential content.

This is capture and recovery, **not live injection**. No destination is guessed from a Google key prefix. Existing API-manager localStorage remains separate and unchanged. No automatic migration, provider verification, environment push, key rotation, or public MCP credential tool is included. Operator token is memory-only and must be re-entered after reload. This initial implementation is single-operator; it is not staff SSO or a per-user audit system.

## Verified account association

Vercel team **5Star** (`5280menu`, `team_yXUiLQXJG67i2CBkEhLAhE8V`) hosts project `copress-dashboard` (`prj_khskg2gU0jLL3Y5j3OJxE9q1znkN`) and `satcom.conews.press`. Source remains `idigitalpro1/copress-dashboard`. The connected GitHub organization listing was empty. The reported 500 GB allocation has not been verified; do not treat it as a credential store or claim this code uses it.

## Activation

1. In the existing 5Star Vercel project, connect a dedicated **private** Blob store. Do not share a public media store. Configure its read/write token as `VAULT_BLOB_READ_WRITE_TOKEN`.
2. Generate two independent secrets in a trusted terminal/password manager. Configure `VAULT_ENCRYPTION_KEY` as base64 of exactly 32 random bytes, and `VAULT_OPERATOR_TOKEN` as a cryptographically random token (at least 32 characters). Keep both in a password manager. Losing the encryption key makes records unreadable. Do not rotate it without a migration plan.
3. Set these as server-only sensitive environment variables. Never add a `VITE_` or `NEXT_PUBLIC_` prefix. Do not commit secrets or include them in build output. Use a separate store, encryption key and token for preview/testing.
4. Optional `VAULT_ALLOWED_ORIGINS`: comma-separated exact HTTPS origins. Default: `https://satcom.conews.press,https://satcom.5280.menu`. Add a specific preview origin for preview testing; no wildcard.
5. Deploy the branch to preview, unlock with the preview operator token, save a synthetic credential, reload, recover it, and compare its original text. Verify a tokenless request returns 401 and records are not publicly downloadable. Test failure retention and 64 KB limit. Verify the API store, public MCP, video and subscriber alias still work.
6. Before production activation, configure Vercel Firewall rate limits for `/api/credential-inbox`, verify access controls, and retain the previous deployment for rollback. Deploy production with its separate credentials; repeat the synthetic capture/recovery check.

Missing configuration returns 503. It never falls back to browser localStorage, plaintext filesystem storage, a public Blob store, or GitHub. The API does not log payloads or provider errors. Disable request-body logging in any observability integrations. The capture form does not clear its input until the server confirms the write. An ambiguous network failure may create duplicate records on retry; check the inventory. Immutable records prevent overwrite/data loss; deduplication is not yet provided.

## Next phase: verified application placement

Inventory actual server consumers and their environment names. Record a specific project, environment, variable and credential version for each assignment. Add read-only provider validation and authenticated per-destination deployment adapters, with explicit replacement and rollback semantics. Unknown Google API keys remain unassigned until the intended API and restrictions are verified. A GitHub storage allocation does not replace deployment environment secrets.

## Tests

`npm test` includes authenticated encrypted round-trip/recovery, no-secret listing, wrong-key/AAD and tamper rejection, unknown capture, Google classification without guessed destinations, fail-closed configuration, origin/auth rejection, bounded input and sanitized storage failures. No real credentials are used. `npm run build` validates the existing build.
