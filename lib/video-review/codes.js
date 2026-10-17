import { randomBytes } from 'node:crypto';

export const SHORT_CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY3479';

export function generateShortCode(random = n => randomBytes(n)) {
  const bytes = random(4);
  let out = '';
  for (let i = 0; i < 4; i += 1) out += SHORT_CODE_ALPHABET[bytes[i] % SHORT_CODE_ALPHABET.length];
  return out;
}

export function isShortCode(value) {
  return typeof value === 'string' && /^[A-Z0-9]{4}$/.test(value);
}
