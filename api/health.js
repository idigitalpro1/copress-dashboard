import { context } from '../lib/satcom-mcp.js';

export default function handler(_req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, service: 'satcom-operations', version: '1.1.0', release: context.release, contextUpdated: context.updated, scope: 'public-read-only-context', upstreamChecks: false }));
}
