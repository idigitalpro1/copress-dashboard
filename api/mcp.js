import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer } from '../lib/satcom-mcp.js';

const allowedOrigins = new Set([
  'https://satcom.conews.press', 'https://satcom.5280.menu',
  'https://copress-dashboard.vercel.app'
]);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // Native MCP clients omit Origin. Browser calls must come from a known service origin.
  const origin = req.headers.origin;
  const previewOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
  if (origin && !allowedOrigins.has(origin) && origin !== previewOrigin) {
    res.statusCode = 403;
    res.end('Origin is not allowed');
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.end('Use Streamable HTTP POST. Documentation: /codex');
    return;
  }
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    res.statusCode = 415;
    res.end('Content-Type must be application/json');
    return;
  }
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'MCP request failed' } }));
    }
  }
}
