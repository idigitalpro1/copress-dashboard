import { readCatalog, publicCatalog, feedQuery, filterVideos } from '../lib/video-feed.js';

export function createVideoHandler(load = readCatalog, clock = Date.now) {
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS'); res.statusCode = 405;
      res.end(JSON.stringify({ error: 'This is a public read-only video feed.' })); return;
    }
    let filters;
    try { filters = feedQuery(new URL(req.url, 'https://satcom.5280.menu').searchParams); }
    catch { res.statusCode = 400; res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ error: 'Use valid creator, publication, town slugs and a limit from 1 to 50.' })); return; }
    try {
      const { catalog, source } = await load();
      const now = clock();
      const items = filterVideos(publicCatalog(catalog, now), filters);
      res.statusCode = 200;
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({
        version: 1, channel: 'Colorado News Press', status: items.length ? 'ready' : 'empty',
        source, refreshed_at: new Date(now).toISOString(), refresh_seconds: 30, count: items.length, items,
      }));
    } catch {
      // Do not reveal upstream URLs, tokens, raw catalog fields or validation errors.
      res.statusCode = 503;
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ version: 1, status: 'unavailable', error: 'The video feed is temporarily unavailable.', items: [] }));
    }
  };
}
export default createVideoHandler();
