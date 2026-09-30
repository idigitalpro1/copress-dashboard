import { createNewsflowApp, mountNewsflowMcp } from '../services/mcp-vault/build/runtime.mjs';
let application;

// Local durable beta only. Vercel's temporary filesystem cannot hold a vault.
// Enable a reviewed persistent service before promoting this route to hosting.
export default function newsflow(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (process.env.VERCEL || process.env.NEWSFLOW_BETA_ENABLED !== '1') {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'NewsFlow beta requires a configured persistent local backend.' }));
    return;
  }
  try {
    if (!application) {
      application = createNewsflowApp();
      mountNewsflowMcp(application);
    }
    application(req, res);
  } catch {
    if (res.headersSent) { res.end(); return; }
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'NewsFlow beta configuration is incomplete. Check the server setup guide.' }));
  }
}
