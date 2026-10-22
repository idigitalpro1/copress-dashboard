const E164 = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(input) {
  if (input == null) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('+')) {
    const value = `+${trimmed.slice(1).replace(/\D/g, '')}`;
    return E164.test(value) ? value : null;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return E164.test(`+${digits}`) ? `+${digits}` : null;
}

export function phonesEqual(a, b) {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  return Boolean(left && right && left === right);
}
