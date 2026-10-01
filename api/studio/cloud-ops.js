import { verifySession, parseCookies, SESSION_COOKIE } from '../../lib/video-studio/auth.js';
import { createGoogleIdentity, collectCloudOps, diagnoseCloudOps } from '../../lib/cloud-ops.js';

export function createCloudOpsHandler({ env = process.env, identity = createGoogleIdentity({ env }), collect = collectCloudOps, diagnose = diagnoseCloudOps, clock = Date.now } = {}) {
  let lastDiagnosis = 0;
  return async (req, res) => {
    const send = (status, body) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.end(JSON.stringify(body));
    };
    let authorized = false;
    try { authorized = verifySession(env, parseCookies(req.headers?.cookie)[SESSION_COOKIE]); } catch {}
    if (!authorized) return send(401, { error: 'Studio sign-in required.' });
    if (!['GET', 'POST'].includes(req.method)) return send(405, { error: 'Method unavailable.' });
    if (req.method === 'POST') {
      if (req.headers?.['x-studio-request'] !== '1') return send(403, { error: 'Request header required.' });
      let body;
      try {
        if (req.body) body = typeof req.body === 'object' ? req.body : JSON.parse(req.body);
        else { let input = ''; for await (const chunk of req) { input += chunk; if (input.length > 100) throw new Error(); } body = JSON.parse(input); }
      } catch { return send(400, { error: 'Invalid request.' }); }
      if (body?.op !== 'diagnose' || Object.keys(body).length !== 1) return send(400, { error: 'Only read-only diagnosis is supported.' });
      if (lastDiagnosis && clock() - lastDiagnosis < 10_000) return send(429, { error: 'Wait ten seconds before another diagnosis.' });
      lastDiagnosis = clock();
    }
    try {
      const snapshot = await collect({ identity });
      if (req.method === 'POST') {
        try { snapshot.gemini = await diagnose(snapshot, { identity }); }
        catch (error) { snapshot.gemini = { status: 'unavailable', reason: error.status === 403 ? 'permission_denied' : 'authentication_or_provider_unavailable' }; }
      }
      return send(200, snapshot);
    } catch { return send(503, { error: 'Cloud checks unavailable. Try again later.' }); }
  };
}

export default createCloudOpsHandler();
