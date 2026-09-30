import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Master key storage file for AES-256-GCM
const KEY_FILE = path.resolve(process.cwd(), '.vault_master.key');

function getMasterKey(): Buffer {
  if (process.env.VAULT_MASTER_KEY) {
    return crypto.createHash('sha256').update(process.env.VAULT_MASTER_KEY).digest();
  }

  try {
    if (fs.existsSync(KEY_FILE)) {
      const keyHex = fs.readFileSync(KEY_FILE, 'utf-8').trim();
      if (keyHex.length === 64) {
        return Buffer.from(keyHex, 'hex');
      }
    }
  } catch (err) {
    console.warn('Could not read existing vault master key file, generating new key:', err);
  }

  // Generate a cryptographically secure 256-bit key
  const newKey = crypto.randomBytes(32);
  try {
    fs.writeFileSync(KEY_FILE, newKey.toString('hex'), { mode: 0o600 });
  } catch (err) {
    console.warn('Failed to write master key to file:', err);
  }
  return newKey;
}

const MASTER_KEY = getMasterKey();

export interface EncryptedPayload {
  ivHex: string;
  tagHex: string;
  ciphertextHex: string;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Never stores or transmits plaintext keys outside the secure proxy lifecycle.
 */
export function encryptApiKey(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty plaintext');
  }
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Return compact serializable string format: iv:tag:ciphertext
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an encrypted string using AES-256-GCM.
 * Validates the authentication tag to ensure data integrity at rest.
 */
export function decryptApiKey(encryptedPayload: string): string {
  if (!encryptedPayload || !encryptedPayload.includes(':')) {
    throw new Error('Invalid encrypted payload format');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload structure');
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);

  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Masks an API key for safe UI display (e.g., ••••••••••••••••••••4x8A)
 */
export function maskKey(rawKey: string): string {
  if (!rawKey) return '••••••••••••';
  const trimmed = rawKey.trim();
  if (trimmed.length <= 6) {
    return '••••' + trimmed.slice(-2);
  }
  const last4 = trimmed.slice(-4);
  const prefixLength = Math.min(trimmed.length - 4, 18);
  return '•'.repeat(prefixLength) + last4;
}
