import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Deliberately fixed public content. Never accept a path, URL or credential from a caller.
export const context = JSON.parse(readFileSync(new URL('../data/codex/context.json', import.meta.url), 'utf8'));
export const promptNames = ['grok-development', 'satcom-release', 'partners-editorial'];
export const prompts = Object.fromEntries(promptNames.map(name => [name,
  readFileSync(new URL(`../data/codex/${name}.md`, import.meta.url), 'utf8')
]));

export function buildServer() {
  const server = new McpServer({ name: 'satcom-operations', version: '1.1.0' });
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
  server.registerTool('satcom_structure', {
    title: 'SATCOM structure', description: 'Read the dated, curated public architecture and route map. This does not probe upstream systems.',
    inputSchema: {}, annotations
  }, async () => result({ updated: context.updated, site: context.site, architecture: context.architecture, routes: context.routes, boundaries: context.boundaries }));
  server.registerTool('satcom_priorities', {
    title: 'SATCOM development priorities', description: 'Read the public top ten priorities, owners, target dates, next actions and primary sponsorship platform.',
    inputSchema: {}, annotations
  }, async () => result({ updated: context.updated, commercialPlatform: context.commercialPlatform, priorities: context.priorities }));
  server.registerTool('satcom_prompt', {
    title: 'SATCOM reviewed development prompt', description: 'Read one reviewed prompt. This does not dispatch Grok, delegate work or authorize production changes.',
    inputSchema: { name: z.enum(promptNames) }, annotations
  }, async ({ name }) => result({ name, text: prompts[name] }));
  server.registerResource('satcom-context', 'satcom://context', { mimeType: 'application/json', description: 'Curated public context; no operational secrets or records.' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(context) }] }));
  for (const name of promptNames) {
    server.registerPrompt(name, { title: name.replaceAll('-', ' '), description: `Reviewed ${name} guidance; read-only and not an execution request.` }, async () => ({ messages: [{ role: 'user', content: { type: 'text', text: prompts[name] } }] }));
  }
  return server;
}
