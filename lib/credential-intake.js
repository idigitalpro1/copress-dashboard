import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';

export const MAX_INTAKE_BYTES = 65536;
export function classify(raw) {
  let json;
  try { json = JSON.parse(raw); } catch { /* Preserve unstructured input. */ }
  if (json?.type === 'service_account' && json.private_key && json.client_email) {
    return { provider: 'Google Cloud', kind: 'Service account JSON', fields: ['project_id', 'client_email', 'private_key'], candidates: [], needs: 'Choose the Google Cloud workload and permissions.' };
  }
  if (json?.web?.client_secret || json?.installed?.client_secret) {
    return { provider: 'Google', kind: 'OAuth client JSON', fields: ['client_id', 'client_secret', 'redirect_uris'], candidates: [], needs: 'Choose the application and callback URL.' };
  }
  const fields = [...new Set([...raw.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)].map(m => m[1]))];
  if (/\bAIza[\w-]{20,}\b/.test(raw)) {
    return { provider: 'Google', kind: 'API key', fields, candidates: [], needs: 'Google key detected; identify the enabled API and restrictions before assigning a destination. This is not a Plesk credential.' };
  }
  return { provider: 'Unidentified', kind: fields.length ? 'Environment values' : 'Unclassified text', fields, candidates: [], needs: 'Saved unassigned. Identify the provider and consuming application before export or application.' };
}

export function capture(input) {
  if (!input || typeof input.raw !== 'string' || !input.raw.trim() || Buffer.byteLength(input.raw) > MAX_INTAKE_BYTES) throw new Error('Invalid intake');
  if (input.label !== undefined && (typeof input.label !== 'string' || input.label.length > 160)) throw new Error('Invalid label');
  return { version: 1, id: randomUUID(), capturedAt: new Date().toISOString(), label: input.label?.trim() || 'Unassigned credential', status: 'saved-unassigned', raw: input.raw, analysis: classify(input.raw) };
}
export function summary(record) {
  const { raw, ...metadata } = record;
  return metadata;
}
export function encryptionKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('Invalid encryption configuration');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('Invalid encryption configuration');
  return key;
}
export function seal(record, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(record.id));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(record), 'utf8'), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
}
export function unseal(value, id, key) {
  const envelope = JSON.parse(value);
  if (envelope.version !== 1) throw new Error('Unknown envelope');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const record = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  if (record.id !== id) throw new Error('Invalid record');
  return record;
}
