-- Published SATCOM video feed overlay (satcom.conews.press/video).
-- PREVIEW ONLY. Do not apply this file to a live Supabase project from CI or an agent.
--
-- Live playback URLs are public Cloudinary deliveries created only at approve time.
-- The Git catalog data/video-feed.json is not written by the API.

create table if not exists public.video_feed_published (
  id text primary key,
  status text not null check (status in ('published', 'unpublished')),
  entry jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.video_feed_published enable row level security;

comment on table public.video_feed_published is
  'Approved public catalog entries for /api/videos overlay. No unpublished private URLs.';
