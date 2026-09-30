# SATCOM + PressVault / NewsFlow beta

The `beta-unified` branch integrates the PressVault frontend and prompt library into SATCOM under `services/mcp-vault/`. PressVault is the repository whose metadata names the app **NewsFlow Orchestrator**; there is no second repository required for that app. The upstream commit is recorded in `services/mcp-vault/UPSTREAM.md` and the subtree merge.

The beta uses SATCOM's existing HTTP listener on **127.0.0.1:4321**. The Express module never creates another listener. Existing Studio, health, board, video, and public MCP handlers retain their routes. The existing `/apikeys` vault remains browser-local; no browser credentials are automatically migrated or turned into server environment variables.

## Routes

| Route | Purpose | Access |
| --- | --- | --- |
| `/newsflow/` | NewsFlow vault, prompts, sandbox, audit UI | Sign-in required before API requests |
| `/api/vault/*` | Encrypted key storage, explicit testing, rotation, import, audit metadata | Beta bearer token |
| `/api/prompts` and `/api/prompts/*` | Prompt CRUD, version restore, key mapping, explicit execution | Beta bearer token |
| `/api/newsflow/samples` | Fictional newspaper examples | Beta bearer token |
| `/api/newsflow/mcp` | Stateless Streamable HTTP MCP | Beta bearer token; POST, GET returns 405 |
| `/sse` and `/message` | Legacy HTTP+SSE compatibility | Beta bearer token on both routes |
| `/mcp` and `/api/mcp` | Existing public SATCOM context | Four public read-only SATCOM tools |

Vault and prompt paths were checked against SATCOM's existing routes. The new handler owns only the listed private namespaces. Responses use `Cache-Control: no-store`. Foreign browser origins are rejected. Requests from native clients without an Origin header can authenticate using the bearer token. Loopback Host headers must identify `localhost`, `127.0.0.1`, or `[::1]` with the listener's exact port; the local dashboard rejects other hosts before serving pages or APIs. Forwarding headers do not establish trust.

## Install and run locally

Use **Node 22.12 or later within the 22.x line**. All dependencies are installed through the root npm workspace and lockfile. Vite's esbuild peer collision is resolved with a compatible esbuild version; Express uses a patched 4.x release. MCP SDK 1.30.0 is retained. AES-256-GCM uses Node's built-in `node:crypto`.

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck:newsflow
npm test
```

Create the beta configuration in a private directory **outside the website**. The helper creates fresh encryption and access secrets once, saves a mode-600 file in a mode-700 directory, prints only the path, and refuses to overwrite an existing configuration:

```sh
node scripts/setup-newsflow.mjs /Users/IT/Documents/ChatGPT/AWS/.satcom-newsflow-beta
node --env-file=/Users/IT/Documents/ChatGPT/AWS/.satcom-newsflow-beta/newsflow.env scripts/dev-codex.mjs
```

Open `http://127.0.0.1:4321/newsflow/`. Enter the configured `NEWSFLOW_MCP_TOKEN` in the sign-in field. Read/copy that value privately on your machine; do not paste it into chat. The browser holds it only in memory and clears it on disconnect, page exit/reload, or 15 minutes without user interaction. Background requests do not extend that idle period. The starter configuration leaves external model execution disabled. No provider keys are generated or provisioned by this helper.

| Setting | Requirement |
| --- | --- |
| `NEWSFLOW_BETA_ENABLED` | `1` to enable local beta routing |
| `NEWSFLOW_MCP_TOKEN` | At least 32 characters; generated token is 256 bits |
| `NEWSFLOW_MASTER_KEY` | Exactly 64 hexadecimal characters; stable across restarts |
| `NEWSFLOW_DATA_DIR` | Absolute private persistent directory outside the website |
| `NEWSFLOW_ALLOWED_ORIGINS` | Exact browser origin URLs; local 4321 origins are allowed |
| `NEWSFLOW_ALLOW_EXECUTION` | `1` only when the operator enables paid model execution |

Back up the encrypted data and its encryption key securely. Losing or replacing the master key makes the stored credentials unreadable. Use a directory owned by the server user with mode `700` and files with mode `600`; shared directories, symlinks, hard links, and corrupt files fail closed. The server does not change permissions on an arbitrary existing directory. Stored records have bounded schemas, and unexpected fields are excluded from API/audit output. Existing file contents are checked before replacement, including clear/delete operations. The local JSON store is intended for one server process, not a multi-instance deployment.

## Hardening and request limits

The REST and MCP guards share constant-time bearer checks and a bounded authentication-failure budget. More than 20 failures from one socket address or 60 total failures in a minute returns `429` with `Retry-After`. A correct bearer remains usable after an unauthenticated failure flood. Duplicate authentication, Host, Origin, media-type, encoding, and Accept headers are rejected.

REST permits 300 authenticated requests and 60 mutations per minute, with at most 32 in flight. MCP permits 240 requests per minute, with at most eight HTTP operations and eight pending legacy requests per session. Legacy SSE has a maximum of 20 sessions, a ten-minute idle expiry, and a thirty-minute absolute lifetime. The existing provider budget remains shared by REST and MCP: 60 provider calls per minute and at most three concurrent calls. These limits bound a single operator process; they do not replace provider billing controls.

JSON requests must use UTF-8 `application/json` without compression. REST bodies are limited to 512 KiB; MCP bodies to 256 KiB. Both reject overly deep or complex JSON and unsafe object properties. These checks also apply when a parent Express application has already parsed the body. MCP clients must send the transport's appropriate Accept types, and stalled MCP body uploads time out after ten seconds. The local listener also limits header size and upload time.

The browser sends credentials only to the same origin, refuses redirects, and aborts pending work on disconnect or idle expiry. API requests have a 90-second client deadline. An abort or timeout cannot undo a mutation or paid provider call that the server already accepted: refresh and check the saved state before retrying. Secret inputs are cleared on modal close, and pasted `.env` text moves directly into a masked review.

Local and hosted NewsFlow pages use a Content Security Policy, deny framing, suppress referrers, and disable unrelated device capabilities. Server source folders and build/configuration files are blocked by the local static server; hosted source paths redirect into the disabled private handler. Public SATCOM MCP remains separate and retains its four read-only tools.

## Key and file import

Saving a key encrypts it and marks it **untested**. Testing is a separate explicit action against the selected built-in provider. Only fixed HTTPS endpoints for Gemini, OpenAI, and Anthropic are contacted. Unknown/custom keys can be stored without being sent to an arbitrary endpoint. Redirects and custom headers/endpoints are disabled.

Uploaded `.env` files are parsed as literal text, reviewed with masked values, then imported only after confirmation. The parser rejects interpolation, shell syntax, unsupported multiline values, unsafe names, and duplicate source names. Configuration secrets for NewsFlow and AWS are excluded. Import uses the selected uploaded values, never server `.env` files or a `process.env` scan. Existing keys are preserved; exact duplicate imports are skipped. Cards show save timestamps and source names.

The shared browser importer also accepts the isolated names `GEMINI_KEY_COPY`, `GEMINI_KEY_VIDEO`, and `GEMINI_KEY_HEALTH`, with distinct labels and official acquisition links. Importing those cards still does not configure SATCOM's server environment.

## MCP and Codex

`.codex/config.toml` preserves the existing model settings and adds:

```toml
[mcp_servers.newsflow-beta]
url = "http://127.0.0.1:4321/api/newsflow/mcp"
bearer_token_env_var = "NEWSFLOW_MCP_TOKEN"
required = false
enabled_tools = ["newsflow_vault_status", "newsflow_list_prompts", "newsflow_get_prompt", "execute_newspaper_pipeline"]
tool_timeout_sec = 210
```

The local endpoint actually implements **Streamable HTTP**. `/sse` plus `/message` are legacy compatibility routes; that legacy pair must not be described as Streamable HTTP. See the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).

| Tool | Behavior |
| --- | --- |
| `newsflow_vault_status` | Safe vault readiness and key metadata; no raw keys or ciphertext |
| `newsflow_list_prompts` | Prompt summaries |
| `newsflow_get_prompt` | One stored prompt |
| `execute_newspaper_pipeline` | One to three mapped prompt stages; draft output, no publishing |

Execution requires `NEWSFLOW_ALLOW_EXECUTION=1` and an explicitly selected or mapped validated key. The pipeline passes each stage's output to the next stage. It checks the transport's cancellation/disconnect signal before dispatching each stage, so cancellation stops later provider calls; an already accepted call can still complete and incur usage. Legacy paid pipeline requests must use a nonzero number or nonempty string request ID because SDK 1.30 does not cancel falsy IDs; initialization can still use ID `0`. A pending paid request keeps its capacity slot until it settles. The pipeline never falls back to an environment key or first/default key. Provider errors are redacted; pricing is not guessed from stale upstream estimates.

Project configuration is used for trusted projects. Open this **beta checkout** in Codex, supply `NEWSFLOW_MCP_TOKEN` to that Codex host's environment, start the local server, and refresh/restart the MCP connection. A successful SDK handshake proves the endpoint and tool registry; editing TOML alone does not add tools to an already-running chat. See [official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Google AI setup still required

As checked during this integration, SATCOM's Vercel environment list does not contain `GEMINI_KEY_COPY` in Preview or Production. A generic `GEMINI_API_KEY` on one old preview branch does not satisfy the current Studio contract. Configure the intended Studio key as **`GEMINI_KEY_COPY`** in the chosen deployment environment. NewsFlow instead uses the credential explicitly saved and mapped in its own encrypted vault. These are separate connections.

1. Select the intended Cloud project and obtain a Gemini-restricted/auth key in [Google AI Studio](https://aistudio.google.com/apikey). Use restrictions appropriate to server requests. [Official key guidance](https://ai.google.dev/gemini-api/docs/api-key).
2. Verify the project's paid billing state before sending confidential deal/NDA material. Google's unpaid API terms allow content to be used for improvement and direct users to avoid confidential information. [Gemini API terms](https://ai.google.dev/gemini-api/terms).
3. Verify actual project quota and credits. Limits apply per project, not per API key. Separate keys on the same project do not create isolated quota pools. [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).
4. Set the available AI Studio project spend cap and monitor usage. Google labels project caps experimental and warns of billing delay/overages. Cloud budget alerts alone are not a hard spending stop. The older `docs/gemini.md` $150 example is not evidence that a cap is configured. [Gemini billing and spend caps](https://ai.google.dev/gemini-api/docs/billing), [Cloud budget behavior](https://docs.cloud.google.com/billing/docs/how-to/budgets).
5. Gemini API key calls do not require an OAuth consent flow. Add appropriate APIs and OAuth scopes separately if private Drive, Docs, or Gmail integration is requested.

No real provider request, billing change, key creation, environment-value retrieval, or production credential migration is part of this beta verification.

## Hosting boundary

This beta is implemented and testable locally. SATCOM's current Vercel deployment has an ephemeral filesystem, so the private handler returns **503 on Vercel** rather than claiming durable credential storage. Before hosting this beta, provision an authenticated persistent service or database/KMS adapter and verify recovery, authorization, TLS, and deployment routing. Production promotion is a separate release step. Do not add provider keys or private vault files to a Vercel static output directory.
