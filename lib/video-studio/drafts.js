import { z } from 'zod';
import { videoSchema } from '../video-feed.js';
import { SOCIAL_PLATFORMS } from './brands.js';
import { DEFAULT_WORKSPACE, isWorkspaceId, workspaceForPublicId } from './workspaces.js';

// Workspace a saved draft belongs to. Drafts saved before workspaces existed carry no marker, so
// they follow the Cloudinary path of their source clip (satcom/paul-hill/... -> Paul Hill),
// and everything else defaults to My properties.
export function draftWorkspace(entry) {
  const marked = entry?.workspace ?? entry?.studio?.workspace;
  if (isWorkspaceId(marked)) return marked;
  return workspaceForPublicId(entry?.studio?.source?.public_id);
}

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const line = max => z.string().max(max).transform(v => v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim());

export const draftMetaSchema = z.object({
  title: line(200).refine(v => v.length > 0, 'Title is required'),
  description: z.string().max(1000).transform(v => v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim()).default(''),
  creator: slug.default('paul-hill'),
  credit: line(200).default(''),
  publications: z.array(slug).min(1).max(30).default(['network']),
  towns: z.array(slug).max(30).default([]),
  hashtags: z.array(z.string().max(40)).max(10).default([]),
  social: z.record(z.string(), z.string().max(2200)).default({}),
});

export function slugify(text, max = 60) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '') || 'clip';
}

export function draftId(title, now) {
  const d = new Date(now).toISOString().replace(/[-:T]/g, '').slice(0, 12);
  return `${slugify(title)}-${d}`;
}

// A draft is a catalog entry that the public API always excludes (status "draft",
// published:false). Publishing remains a manual, reviewed step.
export function buildDraftEntry({ meta, now, playbackUrl, posterUrl, vttUrl, brand, format, source, window, workspace = DEFAULT_WORKSPACE }) {
  const social = {};
  for (const p of SOCIAL_PLATFORMS) if (meta.social[p]) social[p] = meta.social[p];
  const entry = {
    id: draftId(meta.title, now),
    title: meta.title,
    description: meta.description,
    creator: meta.creator,
    credit: meta.credit || meta.creator,
    publications: meta.publications,
    towns: meta.towns,
    published_at: new Date(now).toISOString(),
    status: 'draft',
    published: false,
    kind: 'recorded',
    poster_url: posterUrl,
    playback: { type: 'mp4', url: playbackUrl },
    captions: vttUrl ? [{ url: vttUrl, language: 'en', label: 'English' }] : [],
    social,
    hashtags: meta.hashtags.map(h => h.replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean),
    studio: {
      tool: 'satcom-video-studio', brand, format, workspace,
      source: { public_id: source.public_id, type: source.type },
      trim: { start: window.start, end: window.end },
      saved_at: new Date(now).toISOString(),
    },
  };
  const check = videoSchema.safeParse({ ...entry, status: 'published' });
  return {
    entry,
    ready_to_publish: check.success,
    issues: check.success ? [] : check.error.issues.slice(0, 10).map(i => `${i.path.join('.') || 'entry'}: ${i.message}`),
  };
}
