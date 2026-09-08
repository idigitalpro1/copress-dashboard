import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import handler from '../api/mcp.js';
import health from '../api/health.js';
let server, base;
before(async () => {
  server = createServer((req,res)=> req.url === '/api/health' ? health(req,res) : handler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async ()=> { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); });
async function connected(fn) {
  const client = new Client({name:'satcom-test',version:'1.0.0'});
  try { await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'))); await fn(client); }
  finally { await client.close(); }
}
test('SDK handshake exposes only the three allowlisted read-only tools', ()=>connected(async client=> {
  assert.equal(client.getServerVersion().name,'satcom-operations');
  const {tools}=await client.listTools();
  assert.deepEqual(tools.map(x=>x.name).sort(),['satcom_priorities','satcom_prompt','satcom_structure']);
  assert.ok(tools.every(x=>x.annotations.readOnlyHint && !x.annotations.destructiveHint && !x.annotations.openWorldHint));
}));
test('tools return structure, ten owners/next actions and primary Partners platform', ()=>connected(async client=> {
  const structure=(await client.callTool({name:'satcom_structure',arguments:{}})).structuredContent;
  assert.equal(structure.site,'https://satcom.conews.press');
  assert.ok(structure.routes.some(x=>x.path==='/codex'));
  const result=(await client.callTool({name:'satcom_priorities',arguments:{}})).structuredContent;
  assert.equal(result.priorities.length,10);
  assert.ok(result.priorities.every(x=>x.owner && x.due && x.next && x.status));
  assert.equal(result.commercialPlatform.role,'Primary advertising and sponsorship platform');
}));
test('unknown tools and path traversal prompt names cannot access files or execute actions', ()=>connected(async client=> {
  for (const args of [{name:'take_message',arguments:{}},{name:'satcom_prompt',arguments:{name:'../../.env'}},{name:'satcom_prompt',arguments:{name:'https://example.com'}}]) {
    const result=await client.callTool(args); assert.equal(result.isError,true);
  }
}));
test('resource and all prompts read successfully without dispatch', ()=>connected(async client=> {
  const list=await client.listResources();assert.equal(list.resources.length,1);
  const resource=await client.readResource({uri:'satcom://context'});
  assert.equal(JSON.parse(resource.contents[0].text).schemaVersion,1);
  await assert.rejects(()=>client.readResource({uri:'file:///etc/passwd'}));
  const {prompts}=await client.listPrompts();assert.equal(prompts.length,3);
  for(const prompt of prompts) {
    const result=await client.getPrompt({name:prompt.name});
    assert.match(result.messages[0].content.text,/Do not delegate/);
    assert.match(result.messages[0].content.text,/Partners in the Community/);
  }
}));
test('parallel stateless clients do not mix requests', ()=>Promise.all(Array.from({length:4},()=>connected(async client=>assert.equal((await client.callTool({name:'satcom_priorities',arguments:{}})).structuredContent.priorities.length,10)))));
test('disallowed browser origin fails closed', async()=>assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'})).status,403));
test('GET returns 405 with POST Allow header',async()=> { const r=await fetch(base+'/mcp');assert.equal(r.status,405);assert.equal(r.headers.get('allow'),'POST'); });
test('wrong content type is rejected',async()=>assert.equal((await fetch(base+'/mcp',{method:'POST',body:'{}'})).status,415));
test('malformed JSON returns a protocol error',async()=> {const r=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:'{'});assert.equal(r.status,400);});
test('health declares its narrow scope and avoids caching',async()=> {const r=await fetch(base+'/api/health');const j=await r.json();assert.equal(j.upstreamChecks,false);assert.equal(j.scope,'public-read-only-context');assert.equal(r.headers.get('cache-control'),'no-store');});
test('release preserves subscription host routing and Hermes proxy',()=> {const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));assert.ok(config.redirects.some(x=>x.has?.[0]?.value==='subscribe.thevillager.today' && x.destination==='/subscribe-villager/'));assert.ok(config.rewrites.some(x=>x.destination==='https://codex.conews.press/api/v1/platform/hermes/:path*'));});
