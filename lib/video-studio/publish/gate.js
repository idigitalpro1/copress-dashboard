import { z } from 'zod';
import { AI_DISCLOSURE_LINE } from './config.js';

const AI_FIELDS = ['title', 'description', 'captions', 'tags'];

export function isSyntheticClip({ tags = [], sidecar } = {}) {
  const set = new Set((tags || []).map(t => String(t).toLowerCase()));
  if (set.has('ai-generated') || set.has('gemini-omni')) return true;
  const model = String(sidecar?.model || '');
  return /omni|veo/i.test(model);
}

export function originalFromSidecar(sidecar = {}) {
  if (!sidecar || typeof sidecar !== 'object') return null;
  const nested = sidecar.source && typeof sidecar.source === 'object' ? sidecar.source : null;
  const publicId = sidecar.original_public_id || sidecar.source_public_id
    || (typeof sidecar.source === 'string' ? sidecar.source : null)
    || nested?.public_id || sidecar.original;
  if (typeof publicId !== 'string' || !publicId || publicId.includes('..')) return null;
  const type = sidecar.source_type || nested?.type
    || (publicId.startsWith('satcom/paul-hill/originals/') ? 'authenticated' : 'upload');
  const allowed = type === 'upload' || type === 'authenticated' || type === 'private';
  return { public_id: publicId, type: allowed ? type : 'upload' };
}

export function withAiDisclosure(description = '', { required, synthidNote, max = 1000 } = {}) {
  const body = String(description || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (!required) return body.slice(0, max);
  const extra = synthidNote ? `\n${String(synthidNote).replace(/\s+/g, ' ').trim().slice(0, 240)}` : '';
  const suffix = `\n\n${AI_DISCLOSURE_LINE}${extra}`;
  const room = Math.max(0, max - suffix.length);
  const head = body.includes(AI_DISCLOSURE_LINE) ? body.slice(0, max) : body.slice(0, room);
  return (head.includes(AI_DISCLOSURE_LINE) ? head : head + suffix).trim().slice(0, max);
}

export const reviewInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  tags: z.array(z.string().max(40)).max(20).default([]),
  captions: z.string().max(40000).default(''),
  credit_name: z.string().trim().min(1, 'Name is required').max(120),
  shoot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date is required (YYYY-MM-DD)'),
  review: z.object({
    title: z.boolean(),
    description: z.boolean(),
    captions: z.boolean(),
    tags: z.boolean(),
  }),
  consent: z.object({
    people: z.boolean(),
    music: z.boolean(),
    paul_hill: z.boolean(),
  }),
  contains_synthetic_media: z.boolean().optional(),
  youtube_privacy: z.enum(['private', 'unlisted', 'public']).optional(),
  asset_tags: z.array(z.string().max(40)).max(30).default([]),
});

export function evaluateGate(input, { sidecar } = {}) {
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, 12).map(i => `${i.path.join('.') || 'review'}: ${i.message}`),
      field: issue.path.join('.') || 'review',
    };
  }
  const data = parsed.data;
  const synthetic = isSyntheticClip({ tags: data.asset_tags, sidecar });
  const issues = [];
  for (const field of AI_FIELDS) {
    if (!data.review[field]) issues.push(`AI field "${field}" is unreviewed.`);
  }
  if (!data.consent.people) issues.push('Consent required: people on screen.');
  if (!data.consent.music) issues.push('Consent required: music rights.');
  if (!data.consent.paul_hill) issues.push("Consent required: Paul Hill's OK.");
  if (synthetic && data.contains_synthetic_media === false) {
    issues.push('YouTube altered/synthetic disclosure cannot be turned off for AI-generated clips.');
  }
  const containsSyntheticMedia = synthetic ? true : Boolean(data.contains_synthetic_media);
  const description = withAiDisclosure(data.description, {
    required: containsSyntheticMedia,
    synthidNote: sidecar?.synthid_note,
    max: 1000,
  });
  return {
    ok: issues.length === 0,
    issues,
    synthetic,
    contains_synthetic_media: containsSyntheticMedia,
    description,
    title: data.title,
    tags: data.tags.map(t => t.replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean),
    captions: data.captions,
    credit_name: data.credit_name,
    shoot_date: data.shoot_date,
    youtube_privacy: data.youtube_privacy,
    review: data.review,
    consent: data.consent,
  };
}

export const AI_FIELDS_LIST = AI_FIELDS;
