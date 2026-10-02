import { z } from 'zod';
import { BRANDS, VIDEO_FORMATS, IMAGE_FORMATS } from './brands.js';
import { colonId, layerText, validPublicId, GENERATED_FOLDER } from './cloudinary.js';
import { isIncomingPublicId } from './incoming.js';

const text = max => z.string().max(max).transform(v => v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).default('');

export const sourceSchema = z.object({
  public_id: z.string().refine(validPublicId, 'Invalid public ID'),
  type: z.enum(['upload', 'authenticated', 'private']).default('upload'),
  duration: z.number().positive().max(6 * 3600).optional(),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
}).refine(
  s => s.type !== 'private' || s.public_id.startsWith(`${GENERATED_FOLDER}/`) || isIncomingPublicId(s.public_id),
  { message: 'Private sources must live under satcom/generated/ or satcom/<creator>/incoming/', path: ['type'] },
);

export const imageSourceSchema = z.object({
  public_id: z.string().refine(validPublicId, 'Invalid public ID'),
  type: z.enum(['upload', 'authenticated']).default('upload'),
});

const brandSchema = z.object({
  preset: z.enum(Object.keys(BRANDS)).default('satcom'),
  bug: z.enum(['wordmark', 'logo', 'none']).default('wordmark'),
  lower_name: text(80),
  lower_title: text(100),
  lower_mode: z.enum(['intro', 'always', 'off']).default('intro'),
}).default({});

export const editSchema = z.object({
  start: z.number().min(0).max(6 * 3600).default(0),
  end: z.number().positive().max(6 * 3600).optional(),
  formats: z.array(z.enum(Object.keys(VIDEO_FORMATS))).min(1).max(3).default(['9:16']),
  gravity: z.enum(['auto', 'center', 'north', 'south']).default('center'),
  brand: brandSchema,
  captions: z.object({
    enabled: z.boolean().default(false),
    // Pixel size relative to a 1080px short edge.
    size: z.number().int().min(24).max(120).default(64),
    position: z.enum(['auto', 'south', 'center', 'north']).default('auto'),
  }).default({}),
});

export function resolveWindow(edit, source) {
  const duration = source.duration ?? Infinity;
  const start = Math.min(edit.start, Number.isFinite(duration) ? Math.max(0, duration - 0.5) : edit.start);
  let end = edit.end ?? (Number.isFinite(duration) ? duration : start + 60);
  end = Math.min(end, duration);
  if (!(end > start + 0.2)) throw Object.assign(new Error('Trim end must be after trim start.'), { status: 400, expose: true });
  return { start: round(start), end: round(end), duration: round(end - start) };
}

const round = n => Math.round(n * 100) / 100;
const px = (n, scale) => Math.max(1, Math.round(n * scale));

function layerTiming(mode, clipDuration) {
  if (mode !== 'intro' || !Number.isFinite(clipDuration)) return '';
  const end = Math.min(clipDuration, 6.5);
  return end > 1 ? `,so_0.5,eo_${round(end)}` : '';
}

// Brand bug + lower third, shared by video and image renders.
export function brandLayers(brandInput, { width, height, clipDuration, vertical } = {}) {
  const brand = BRANDS[brandInput.preset];
  const scale = Math.min(width || 1080, height || 1080) / 1080;
  const m = px(40, scale);
  const layers = [];
  if (brandInput.bug === 'logo') {
    layers.push(`l_${colonId(brand.logo)}`, `c_scale,w_${px(220, scale)}`, `fl_layer_apply,g_north_east,x_${m},y_${m},o_92`);
  } else if (brandInput.bug === 'wordmark') {
    layers.push(`l_text:Arial_${px(30, scale)}_bold_letter_spacing_4:${layerText(`\u2002${brand.wordmark}\u2002`)},co_rgb:${brand.accent},b_rgb:${brand.primary}`,
      `fl_layer_apply,g_north_east,x_${m},y_${m}`);
  }
  if (brandInput.lower_mode !== 'off' && (brandInput.lower_name || brandInput.lower_title)) {
    const timing = clipDuration === undefined ? '' : layerTiming(brandInput.lower_mode, clipDuration);
    const base = px(vertical ? 360 : 90, scale);
    const titleText = brandInput.lower_title || brand.tagline;
    layers.push(`l_text:Arial_${px(30, scale)}_bold:${layerText(`\u2002${titleText}\u2002`)},co_rgb:${brand.accentInk},b_rgb:${brand.accent}`,
      `fl_layer_apply,g_south_west,x_${m},y_${base}${timing}`);
    if (brandInput.lower_name) {
      layers.push(`l_text:Arial_${px(50, scale)}_bold:${layerText(`\u2002${brandInput.lower_name}\u2002`)},co_white,b_rgb:${brand.primary}`,
        `fl_layer_apply,g_south_west,x_${m},y_${base + px(46, scale)}${timing}`);
    }
  }
  return layers;
}

// Full Cloudinary video transformation for one social format.
export function videoTransformation(edit, source, format, { captionsId } = {}) {
  const f = VIDEO_FORMATS[format];
  const win = resolveWindow(edit, source);
  const parts = [`so_${win.start},eo_${win.end}`, `c_fill,ar_${format},w_${f.width},g_${edit.gravity}`];
  if (captionsId && edit.captions.enabled) {
    const position = edit.captions.position === 'auto' ? (format === '9:16' ? 'center' : 'south') : edit.captions.position;
    // Subtitle font sizes are libass units relative to a 288-line canvas.
    const size = Math.max(4, Math.round(edit.captions.size * (Math.min(f.width, f.height) / 1080) * 288 / f.height));
    parts.push(`l_subtitles:Arial_${size}_bold:${colonId(captionsId)},co_white,b_rgb:000000b3`, `fl_layer_apply,g_${position}`);
  }
  parts.push(...brandLayers(edit.brand, { width: f.width, height: f.height, clipDuration: win.duration, vertical: format === '9:16' }));
  parts.push('q_auto');
  return { transformation: parts.join('/'), window: win, format: f };
}

export function posterTransformation(edit, source, format) {
  const f = VIDEO_FORMATS[format];
  const win = resolveWindow(edit, source);
  const at = round(win.start + Math.min(1, win.duration / 2));
  const parts = [`so_${at}`, `c_fill,ar_${format},w_${f.width},g_${edit.gravity}`,
    ...brandLayers({ ...edit.brand, lower_mode: edit.brand.lower_mode === 'off' ? 'off' : 'always' }, { width: f.width, height: f.height, vertical: format === '9:16' }), 'q_auto'];
  return parts.join('/');
}

export const imageBrandSchema = z.object({
  formats: z.array(z.enum(Object.keys(IMAGE_FORMATS))).min(1).max(5).default(['1:1']),
  gravity: z.enum(['auto', 'center', 'north', 'south']).default('auto'),
  headline: text(140),
  brand: brandSchema,
});

export function imageTransformation(spec, format) {
  const f = IMAGE_FORMATS[format];
  const brand = BRANDS[spec.brand.preset];
  const scale = Math.min(f.width, f.height) / 1080;
  const parts = [`c_fill,ar_${format},w_${f.width},g_${spec.gravity}`];
  if (spec.headline) {
    const size = px(format === '1.91:1' ? 50 : 62, scale);
    const perLine = Math.max(12, Math.floor((f.width - px(160, scale)) / (size * 0.56)));
    const lines = wrap(spec.headline, perLine).slice(0, 4);
    const hasLower = spec.brand.lower_mode !== 'off' && (spec.brand.lower_name || spec.brand.lower_title);
    parts.push(`l_text:Georgia_${size}_bold_line_spacing_-8:${layerText(lines.map(l => `\u2002${l}\u2002`).join('\n'))},co_white,b_rgb:${brand.primary}e6`,
      `fl_layer_apply,g_south_west,x_${px(40, scale)},y_${px(format === '9:16' ? 520 : hasLower ? 230 : 90, scale)}`);
  }
  parts.push(...brandLayers({ ...spec.brand, lower_mode: spec.brand.lower_mode === 'off' ? 'off' : 'always' }, { width: f.width, height: f.height, vertical: format === '9:16' }));
  parts.push('q_auto');
  return { transformation: parts.join('/'), format: f, brand };
}

function wrap(text, width) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > width) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
