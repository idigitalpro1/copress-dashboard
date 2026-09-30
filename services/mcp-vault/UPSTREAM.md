# NewsFlow beta provenance

This module was imported as a Git subtree from `idigitalpro1/pressvault`, whose application name is **NewsFlow Orchestrator - Vault & Prompt Manager**.

- Upstream repository: https://github.com/idigitalpro1/pressvault
- Upstream commit: `57ed4156b039997f8196774d7ee531fb09214163`
- Integration branch: SATCOM `beta-unified`

The original frontend and prompt library are retained. The backend is adapted into a guarded Express module mounted by SATCOM's HTTP server. The beta removes automatic server-environment discovery, implicit key fallback, arbitrary provider endpoints, and startup-generated encryption keys. It adds explicit configuration, authenticated APIs, controlled imports, durable local AES-256-GCM storage, and MCP transports. Upstream did not contain an MCP server.

See [the setup and route guide](../../docs/newsflow-beta.md) before running the beta or proposing a hosted deployment.
