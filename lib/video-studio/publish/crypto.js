import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { parseTokenEncKey } from './config.js';

export function encryptJson(obj, key) {
  const keyBuf = Buffer.isBuffer(key) ? key : parseTokenEncKey(key);
  if (!keyBuf) throw new Error('YOUTUBE_TOKEN_ENC_KEY is missing or not 32 bytes.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptJson(payload, key) {
  const keyBuf = Buffer.isBuffer(key) ? key : parseTokenEncKey(key);
  if (!keyBuf || typeof payload !== 'string') return null;
  const [ivB, tagB, dataB, extra] = payload.split('.');
  if (!ivB || !tagB || !dataB || extra !== undefined) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyBuf, Buffer.from(ivB, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
    const out = Buffer.concat([decipher.update(Buffer.from(dataB, 'base64url')), decipher.final()]);
    return JSON.parse(out.toString('utf8'));
  } catch {
    return null;
  }
}
