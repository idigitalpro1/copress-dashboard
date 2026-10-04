// Clerk-protected: who is signed in to SATCOM (allowlisted, verified email). 401/403/503 otherwise.
import { guardNodeRequest } from '../lib/clerk-gate.js';
export default async function handler(req, res) {
  const auth = await guardNodeRequest(req, res);
  if (!auth) return;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, userId: auth.userId, email: auth.email }));
}
