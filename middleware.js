// Vercel Routing Middleware: server-side Clerk sign-in for SATCOM operator pages.
// Gated paths and exemptions live in lib/clerk-gate.js. Fails closed without keys.
import { next } from '@vercel/functions';
import { needsGate, checkRequest, denialResponse } from './lib/clerk-gate.js';

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/', '/index', '/index.html',
    '/apistore', '/apistore.html', '/apikeys',
    '/csv-manager', '/csv-manager.html',
    '/linear', '/linear.html',
    '/newsletter', '/newsletter.html',
    '/briefing', '/briefing.html',
    '/video/studio', '/video/studio.html',
    '/api/whoami',
  ],
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') || url.hostname;
  if (!needsGate(host, url.pathname)) return next();
  let result;
  try {
    result = await checkRequest(request);
  } catch (err) {
    console.error('SATCOM Clerk middleware error:', err && err.message);
    result = { kind: 'signed-out' };
  }
  const denial = denialResponse(result, request);
  if (denial) return denial;
  return next({ headers: { 'Cache-Control': 'private, no-store' } });
}
