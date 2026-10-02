-- Publish review flags and audit log.
-- PREVIEW ONLY. Do not apply this file to a live Supabase project from CI or an agent.
--
-- Reviews store checkboxes and shoot_date only — not caption/description text.
-- Audit metadata must stay free of PHI (no prompts, names, medical content).

create table if not exists public.video_publish_reviews (
  asset_public_id text not null,
  version text not null,
  reviewed_title boolean not null default false,
  reviewed_description boolean not null default false,
  reviewed_captions boolean not null default false,
  reviewed_tags boolean not null default false,
  consent_people boolean not null default false,
  consent_music boolean not null default false,
  consent_paul_hill boolean not null default false,
  contains_synthetic_media boolean not null default false,
  youtube_privacy text not null default 'unlisted',
  shoot_date date,
  updated_at timestamptz not null default now(),
  primary key (asset_public_id, version)
);

alter table public.video_publish_reviews enable row level security;

comment on table public.video_publish_reviews is
  'Studio publish gate checkboxes. No caption or description text. No PHI.';

create table if not exists public.video_publish_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action text not null,
  target text,
  asset_public_id text,
  job_id uuid,
  status text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists video_publish_audit_created_idx
  on public.video_publish_audit (created_at desc);

alter table public.video_publish_audit enable row level security;

comment on table public.video_publish_audit is
  'Publish audit. metadata must not contain PHI, prompts, captions, or descriptions.';
