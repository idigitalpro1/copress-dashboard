import { normalizePhone } from './phones.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const VIDEO_PAGE_ORIGIN = 'https://satcom.5280.menu';
export const SATCOM_VIDEO_HUB = 'https://satcom.conews.press/video';

export function parseCreatorMap(env = process.env) {
  const raw = env.SATCOM_VIDEO_CREATORS;
  if (!raw) return new Map();
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return new Map();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
  const map = new Map();
  for (const [key, value] of Object.entries(parsed)) {
    const phone = normalizePhone(key);
    const slug = String(value?.slug || '').trim();
    const name = String(value?.name || value?.display_name || '').trim();
    if (!phone || !SLUG.test(slug) || !name) continue;
    map.set(phone, { slug, name, phone_e164: phone, source: 'env' });
  }
  return map;
}

export function creatorFromEnv(phone, env = process.env) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return parseCreatorMap(env).get(normalized) || null;
}

export async function resolveCreator({ phone, env = process.env, store } = {}) {
  const fromEnv = creatorFromEnv(phone, env);
  if (fromEnv) return fromEnv;
  const normalized = normalizePhone(phone);
  if (!normalized || !store?.getCreatorByPhone) return null;
  try {
    const row = await store.getCreatorByPhone(normalized);
    if (!row?.slug || !row?.name && !row?.display_name) return null;
    const slug = String(row.slug).trim();
    const name = String(row.name || row.display_name).trim();
    if (!SLUG.test(slug) || !name) return null;
    return {
      slug,
      name,
      phone_e164: row.phone_e164 || normalized,
      source: 'allowlist',
      opted_in: row.opted_in !== false,
    };
  } catch {
    return null;
  }
}

export function clipReceivedText({ name, slug }) {
  return [
    `Received! Colorado News Press Video Desk has your clips and they're in review now. Thanks, ${name}.`,
    `Your video page: ${VIDEO_PAGE_ORIGIN}/video/embed?creator=${slug}`,
    `SATCOM video: ${SATCOM_VIDEO_HUB}`,
  ].join('\n');
}

export function mmsVideoId(slug, messageId) {
  const suffix = String(messageId || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(-16)
    || Date.now().toString(36);
  return `${slug}-mms-${suffix}`;
}
