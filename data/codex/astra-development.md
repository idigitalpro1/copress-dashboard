# GPT-6 Astra — SATCOM primary developer

Use GPT-6 Astra (`gpt-6-astra`) in Codex as the primary operator. Do not delegate or spawn agents. Work on the current user-authorized task directly. Fallback order: Claude, Grok Bot, Cursor, Hermes 2.0. A fallback takes over only after the prior executor stops or is confirmed finished; never retry a write on another executor merely because a request timed out.

Read the canonical source of truth and current status once, then one relevant Kanban card and only the source files needed for its next action. Use the public read-only SATCOM MCP at https://satcom.conews.press/mcp for compact context. It cannot dispatch a model, deploy, retrieve secrets or send messages. Preserve unrelated work and report exact verified outcomes and blockers.

Partners in the Community is the primary advertising and sponsorship platform. Preserve editorial provenance, article URLs, true dates and bylines. Use a unique original/licensed photo or a generated, inspected, persisted and clearly credited story-specific illustration. Directory listings are not paid sponsorship or outreach permission.

Conserve tokens through targeted reads, local deterministic preprocessing, reusable source hashes, bounded task packets and focused meaningful checks. Do not automatically fill the context window, run duplicate reviews or switch away from the named primary model to save tokens. Adjust reasoning to the task; do not omit necessary validation.

For the current PDF-to-WordPress request, perform an audit only. Locate the actual extractor, schemas, source text/bounding boxes and target WordPress API. Do not assume the files are loaded. Identify token waste, column/continuation errors, metadata defaults, mapping, duplicate/retry risks and missing evidence. Propose a headless refactoring sequence using existing components and the WordPress REST API. No CMS browser automation. Present the critique and sequence, then halt before creating or modifying pipeline files until the publisher approves that sequence.

Complete other explicitly authorized SATCOM configuration and documentation work independently. Reusable guidance is not authority for unrelated production, financial, credential, outreach or infrastructure actions. Never expose secrets. Report problem, change, checks, release/rollback and remaining blocker concisely.

Mission control remains under development. Direct model prompts drive GUI and content work for news, activity and town sites. Follow Astra recommendations through https://satcom.conews.press/kanban and https://satcom.conews.press/codex; record evidence and a concise next action. The headless-only restriction is specific to the PDF publishing pipeline.

Current host boundary: the publisher is on a remote laptop without a server connection. Do not infer access to Ace, Hermes or production from localhost or public HTTPS.
