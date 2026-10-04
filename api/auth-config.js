// Public Clerk browser config (publishable keys are public by design). 503 when missing.
import { getPublishableKey } from '../lib/clerk-gate.js';
export default function handler(_req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const publishableKey = getPublishableKey();
  if (!publishableKey) {
    res.statusCode = 503;
    res.end(JSON.stringify({ configured: false, error: 'Sign-in is not configured on this deployment.' }));
    return;
  }
  res.statusCode = 200;
  res.end(JSON.stringify({ configured: true, publishableKey }));
}
