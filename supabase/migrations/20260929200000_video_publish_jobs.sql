-- SATCOM Video Studio publish jobs.
-- PREVIEW ONLY. Do not apply this file to a live Supabase project from CI or an agent.
-- Patrick (or an operator) applies it to the chosen Preview project after review.
--
-- Idempotency key is sha256(asset public_id + version + target). A retry of a
-- succeeded target is a no-op and never double-posts.
-- This table holds NO PHI. Do not store captions, descriptions, prompts, or names
-- in error/result beyond YouTube video ids and catalog ids.

create table if not exists public.video_publish_jobs (
  idempotency_key text primary key,
  asset_public_id text not null,
  version text not null,
  target text not null check (target in ('youtube', 'satcom')),
  status text not null check (status in ('pending', 'queued', 'succeeded', 'failed', 'unpublished')),
  youtube_video_id text,
  satcom_entry_id text,
  public_playback_url text,
  error text,
  run_after timestamptz,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_publish_jobs_asset_idx
  on public.video_publish_jobs (asset_public_id, target);

create index if not exists video_publish_jobs_queued_idx
  on public.video_publish_jobs (target, status, run_after);

alter table public.video_publish_jobs enable row level security;

comment on table public.video_publish_jobs is
  'Idempotent Studio publish jobs (YouTube + satcom.conews.press/video). No PHI.';
