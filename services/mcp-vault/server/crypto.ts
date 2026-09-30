import crypto from 'node:crypto';
import path from 'node:path';

export class NewsflowError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}

export function requireNewsflowConfig() {
  const token = process.env.NEWSFLOW_MCP_TOKEN || '';
  const hex = process.env.NEWSFLOW_MASTER_KEY || '';
  const dataDir = process.env.NEWSFLOW_DATA_DIR || '';
  if (process.env.NEWSFLOW_BETA_ENABLED !== '1' || !/^[!-~]{32,4096}$/.test(token) || !/^[a-f0-9]{64}$/i.test(hex) || !path.isAbsolute(dataDir)) {
    throw new NewsflowError('NewsFlow beta is disabled or its required private configuration is incomplete.', 503);
  }
  const allowedOrigins = ['http://localhost:4321', 'http://127.0.0.1:4321'];
  for (const origin of (process.env.NEWSFLOW_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)) {
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error();
      allowedOrigins.push(origin);
    } catch { throw new NewsflowError('NewsFlow allowed-origin configuration is invalid.', 503); }
  }
  return { token, masterKey: Buffer.from(hex, 'hex'), dataDir, allowedOrigins };
}

export function encryptApiKey(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length < 8 || plaintext.length > 16384) throw new NewsflowError('The credential has an unsupported length.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', requireNewsflowConfig().masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptApiKey(payload: string): string {
  const key = requireNewsflowConfig().masterKey;
  try {
    if (typeof payload !== 'string' || !/^[a-f0-9]{24}:[a-f0-9]{32}:(?:[a-f0-9]{2})+$/i.test(payload)) throw new Error();
    const [iv, tag, encrypted] = payload.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]).toString('utf8');
  } catch { throw new NewsflowError('The stored credential could not be authenticated. No data was reset.', 503); }
}

export function maskKey(_rawKey: string): string { return '••••••••••••'; }
