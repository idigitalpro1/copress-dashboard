import { cloudinaryConfig } from '../cloudinary.js';

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

export const DEFAULT_DAILY_UPLOAD_CAP = 6;
export const DEFAULT_YOUTUBE_PRIVACY = 'unlisted';
export const PUBLISHED_FOLDER = 'satcom/published';
export const PUBLISHED_CATALOG_ID = 'satcom-studio/published/catalog';
export const AI_DISCLOSURE_LINE = 'This video includes AI-generated (synthetic) content.';
export const TARGETS = ['youtube', 'satcom'];

export function parseTokenEncKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, 'hex');
  try {
    const buf = Buffer.from(v, 'base64');
    if (buf.length === 32) return buf;
  } catch { /* ignore */ }
  return null;
}

export function youtubeEnvConfigured(env = {}) {
  return Boolean(
    typeof env.YOUTUBE_CLIENT_ID === 'string' && env.YOUTUBE_CLIENT_ID.trim()
    && typeof env.YOUTUBE_CLIENT_SECRET === 'string' && env.YOUTUBE_CLIENT_SECRET.trim()
    && parseTokenEncKey(env.YOUTUBE_TOKEN_ENC_KEY),
  );
}

export function youtubeRedirectUri(env = {}) {
  if (typeof env.YOUTUBE_REDIRECT_URI === 'string' && env.YOUTUBE_REDIRECT_URI.startsWith('http')) {
    return env.YOUTUBE_REDIRECT_URI.trim();
  }
  const host = String(env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (host) return `https://${host}/api/studio/youtube-callback`;
  return 'http://localhost:3000/api/studio/youtube-callback';
}

export function youtubeDailyCap(env = {}) {
  const n = Number(env.YOUTUBE_DAILY_UPLOAD_CAP);
  if (Number.isInteger(n) && n >= 0 && n <= 50) return n;
  return DEFAULT_DAILY_UPLOAD_CAP;
}

export function youtubeDefaultPrivacy(env = {}) {
  const v = String(env.YOUTUBE_DEFAULT_PRIVACY || DEFAULT_YOUTUBE_PRIVACY).toLowerCase();
  return v === 'private' || v === 'unlisted' ? v : DEFAULT_YOUTUBE_PRIVACY;
}

// The publish flow is off unless the YouTube OAuth env trio is present.
// The Studio still renders the review gate in a disabled / not-connected state.
export function publishFeatureEnabled(env = {}) {
  return youtubeEnvConfigured(env);
}

export function publishFlags(env = {}) {
  const youtube = youtubeEnvConfigured(env);
  const cfg = cloudinaryConfig(env);
  const notes = [];
  if (!youtube) {
    notes.push('YouTube is not connected. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and YOUTUBE_TOKEN_ENC_KEY (32-byte key as 64 hex characters) on the Preview project, then complete the one-time channel connect. See docs/youtube.md.');
  } else if (env.YOUTUBE_TOKEN_ENC_KEY && !parseTokenEncKey(env.YOUTUBE_TOKEN_ENC_KEY)) {
    notes.push('YOUTUBE_TOKEN_ENC_KEY is set but is not 32 bytes (use 64 hex characters).');
  }
  if (!cfg) notes.push('Cloudinary is not configured: the satcom.conews.press/video target cannot derive a public delivery URL.');
  return {
    publish: youtube,
    youtube,
    youtube_connected: false,
    satcom: Boolean(cfg),
    notes,
  };
}

export function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

export function nextUtcMidnight(now) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}
