// Brand presets for the SATCOM Video Studio. Colors are hex without "#".
// Logos are optional: upload one per title from the studio ("Upload logo"),
// which stores it at `logo` in Cloudinary. Until then the text wordmark is used.
export const BRANDS = Object.freeze({
  satcom: {
    label: 'SATCOM', wordmark: 'SATCOM', tagline: 'satcom.conews.press',
    primary: '101c27', accent: 'e8b45f', accentInk: '101c27',
    publications: ['network'], logo: 'satcom-studio/brand/satcom',
  },
  'colorado-news-press': {
    label: 'Colorado News Press', wordmark: 'COLORADO NEWS PRESS', tagline: 'conews.press',
    primary: '0b1a3a', accent: 'c8a43a', accentInk: '0b1a3a',
    publications: ['network'], logo: 'satcom-studio/brand/colorado-news-press',
  },
  'the-villager': {
    label: 'The Villager', wordmark: 'THE VILLAGER', tagline: 'thevillager.today',
    primary: '1f3d2b', accent: 'f4efe0', accentInk: '1f3d2b',
    publications: ['the-villager'], logo: 'satcom-studio/brand/the-villager',
  },
  'register-call': {
    label: 'Register-Call', wordmark: 'WEEKLY REGISTER-CALL', tagline: 'weeklyregistercall.com',
    primary: '7a1f1f', accent: 'f4efe0', accentInk: '7a1f1f',
    publications: ['weekly-register-call'], logo: 'satcom-studio/brand/register-call',
  },
});

export const VIDEO_FORMATS = Object.freeze({
  '9:16': { label: 'Vertical 9:16 · Reels, TikTok, Shorts', width: 1080, height: 1920, preview: 540 },
  '1:1': { label: 'Square 1:1 · Feed', width: 1080, height: 1080, preview: 540 },
  '16:9': { label: 'Landscape 16:9 · YouTube, web', width: 1920, height: 1080, preview: 960 },
});

export const IMAGE_FORMATS = Object.freeze({
  '1:1': { label: 'Square post 1080×1080', width: 1080, height: 1080 },
  '4:5': { label: 'Portrait post 1080×1350', width: 1080, height: 1350 },
  '9:16': { label: 'Story 1080×1920', width: 1080, height: 1920 },
  '16:9': { label: 'Thumbnail / poster 1920×1080', width: 1920, height: 1080 },
  '1.91:1': { label: 'Link card 1200×628', width: 1200, height: 628 },
});

export const SOCIAL_PLATFORMS = Object.freeze(['x', 'facebook', 'instagram', 'tiktok', 'youtube_shorts', 'linkedin']);

export function publicBrands() {
  return Object.entries(BRANDS).map(([id, b]) => ({ id, label: b.label, wordmark: b.wordmark, tagline: b.tagline, primary: b.primary, accent: b.accent, publications: b.publications, logo: b.logo }));
}
