import { createHash, timingSafeEqual } from 'node:crypto';
import { put, get, list } from '@vercel/blob';
import { capture, summary, seal, unseal, encryptionKey } from '../lib/credential-intake.js';
const PREFIX = 'credential-inbox/';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const digest = value => createHash('sha256').update(value).digest();
const defaultOrigins = ['https://satcom.conews.press', 'https://satcom.5280.menu'];

export function createHandler({ env = process.env, storage = { put, get, list } } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    // Authentication must precede storage access and parsing of credential contents.
    if (!env.VAULT_OPERATOR_TOKEN || env.VAULT_OPERATOR_TOKEN.length < 32) return send(503, { error: 'Credential inbox has not been configured. Nothing saved.' });
    const auth = req.headers.authorization || '';
    if (!timingSafeEqual(digest(auth), digest(`Bearer ${env.VAULT_OPERATOR_TOKEN}`))) return send(401, { error: 'Unlock the inbox with your operator token.' });
    const origins = env.VAULT_ALLOWED_ORIGINS ? env.VAULT_ALLOWED_ORIGINS.split(',').map(s => s.trim()) : defaultOrigins;
    if (req.headers.origin && !origins.includes(req.headers.origin)) return send(403, { error: 'Origin not allowed.' });
    let key;
    try { key = encryptionKey(env.VAULT_ENCRYPTION_KEY); } catch { return send(503, { error: 'Encrypted storage is not configured. Nothing saved.' }); }
    if (!env.VAULT_BLOB_READ_WRITE_TOKEN) return send(503, { error: 'Private storage is not connected. Nothing saved.' });
    const options = { token: env.VAULT_BLOB_READ_WRITE_TOKEN };
    const url = new URL(req.url, 'https://satcom.conews.press');
    try {
      if (req.method === 'POST') {
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: 'JSON required.' });
        let body = req.body;
        if (body === undefined) {
          const chunks = []; let length = 0;
          for await (const chunk of req) {
            length += Buffer.byteLength(chunk);
            if (length > 100000) return send(413, { error: 'Entry too large. Nothing saved.' });
            chunks.push(Buffer.from(chunk));
          }
          body = Buffer.concat(chunks).toString('utf8');
        }
        let record;
        try {
          if (typeof body === 'string' && Buffer.byteLength(body) > 100000) return send(413, { error: 'Entry too large. Nothing saved.' });
          record = capture(typeof body === 'string' ? JSON.parse(body) : body);
        } catch { return send(400, { error: 'Provide a label and up to 64 KB of credential text. Nothing saved.' }); }
        // Private access is mandatory; never fall back to public Blob or local disk.
        await storage.put(`${PREFIX}${record.id}.json`, seal(record, key), { ...options, access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' });
        return send(201, { record: summary(record) });
      }
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET, POST'); return send(405, { error: 'Method not allowed.' }); }
      const read = async id => {
        const result = await storage.get(`${PREFIX}${id}.json`, { ...options, access: 'private', useCache: false });
        if (!result || result.statusCode !== 200) throw new Error('Unavailable');
        return unseal(await new Response(result.stream).text(), id, key);
      };
      const id = url.searchParams.get('id');
      if (id) {
        if (!UUID.test(id)) return send(400, { error: 'Invalid record ID.' });
        const record = await read(id);
        // Deliberate single-record recovery; never return all secrets in a list.
        res.setHeader('Content-Disposition', `attachment; filename="credential-${id}.json"`);
        return send(200, record);
      }
      const page = await storage.list({ ...options, prefix: PREFIX, limit: 50, cursor: url.searchParams.get('cursor') || undefined });
      const records = [];
      for (const blob of page.blobs) {
        const recordId = blob.pathname.slice(PREFIX.length, -5);
        if (UUID.test(recordId)) records.push(summary(await read(recordId)));
      }
      return send(200, { records, cursor: page.hasMore ? page.cursor : null });
    } catch {
      // Never echo provider errors, request bodies or credentials into logs/responses.
      return send(502, { error: 'Storage operation could not be confirmed. Keep your input and retry; check the inbox for a saved entry.' });
    }
  };
}
export default createHandler();
