export const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024;
export const SIGN_WINDOW_MS = 15 * 60_000;
export const SIGN_LIMIT_PER_IP = 12;
export const SIGN_LIMIT_PER_TOKEN = 20;
export const LOOKUP_LIMIT_PER_IP = 30;

export const ALLOWED_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', '3gp', '3gpp', 'mpeg', 'mpg', 'avi', 'qt']);
export const ALLOWED_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'video/3gpp',
  'video/3gpp2',
  'video/mpeg',
  'video/x-msvideo',
  'video/avi',
]);

export function fileExtension(filename = '') {
  const base = String(filename).split('/').pop().split('\\').pop();
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

export function isAllowedVideo({ filename, mime, bytes }) {
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_FILE_BYTES) return false;
  const ext = fileExtension(filename);
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;
  const type = String(mime || '').toLowerCase().split(';')[0].trim();
  return !type || type === 'application/octet-stream' || ALLOWED_MIME.has(type);
}

export function createLimiter() {
  const buckets = new Map();
  return function limited(key, limit, now, windowMs = SIGN_WINDOW_MS) {
    const entry = buckets.get(key);
    if (!entry || entry.reset < now) {
      buckets.set(key, { count: 1, reset: now + windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > limit;
  };
}
