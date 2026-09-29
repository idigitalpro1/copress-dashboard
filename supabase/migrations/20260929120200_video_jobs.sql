-- SATCOM Gemini Phase A — Omni video job status.
-- PREVIEW ONLY. Do not apply this file to a live Supabase project from CI or an agent.
-- Finished clips are private Cloudinary drafts; nothing here publishes to YouTube or the public feed.

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null check (status in (
    'queued', 'submitting', 'running', 'downloading', 'uploading', 'completed', 'failed', 'cancelled'
  )),
  interaction_id text,
  gemini_status text,
  model text not null,
  prompt text,
  brand text,
  headline text,
  script text,
  aspect_ratio text,
  resolution text,
  target_seconds integer,
  error_redacted text,
  cloudinary_public_id text,
  cloudinary_folder text,
  sidecar jsonb,
  estimated_usd numeric(12, 6)
);

create index if not exists video_jobs_status_created_idx
  on public.video_jobs (status, created_at asc);

alter table public.video_jobs enable row level security;

comment on table public.video_jobs is
  'Async Gemini Omni jobs. Generation never blocks a Vercel request; a cron poller advances state. published is always false in this phase.';
