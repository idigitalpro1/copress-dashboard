import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'http://127.0.0.1:4321/mcp';
const client = new Client({ name: 'satcom-release-verification', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  assert.equal(client.getServerVersion().name, 'satcom-operations');
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(t => t.name).sort(), ['satcom_priorities','satcom_prompt','satcom_structure']);
  assert.ok(tools.tools.every(t => t.annotations.readOnlyHint && !t.annotations.openWorldHint));
  const structure = await client.callTool({ name:'satcom_structure', arguments:{} });
  assert.equal(structure.structuredContent.site, 'https://satcom.conews.press');
  const priorities = await client.callTool({ name:'satcom_priorities', arguments:{} });
  assert.equal(priorities.structuredContent.priorities.length, 10);
  assert.equal(priorities.structuredContent.commercialPlatform.name, 'Partners in the Community');
  const prompt = await client.callTool({ name:'satcom_prompt', arguments:{name:'grok-development'} });
  assert.match(prompt.structuredContent.text, /Do not delegate/);
  const resources = await client.listResources();
  assert.equal(resources.resources.length, 1);
  const context = await client.readResource({uri:'satcom://context'});
  assert.equal(JSON.parse(context.contents[0].text).release, 'satcom-codex-2026-09-07');
  const prompts = await client.listPrompts();
  assert.equal(prompts.prompts.length, 3);
  for (const p of prompts.prompts) assert.ok((await client.getPrompt({name:p.name})).messages[0].content.text.length > 500);
  console.log(JSON.stringify({ endpoint, server:client.getServerVersion(), toolNames:tools.tools.map(t=>t.name), resourceCount:resources.resources.length, promptNames:prompts.prompts.map(p=>p.name), toolCallsVerified:3, resourceReadVerified:true, promptReadsVerified:3, result:'passed' },null,2));
} finally { await client.close(); }
