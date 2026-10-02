-- YouTube OAuth tokens (encrypted at rest) and daily upload quota.
-- PREVIEW ONLY. Do not apply this file to a live Supabase project from CI or an agent.
--
-- encrypted_payload is AES-256-GCM produced with YOUTUBE_TOKEN_ENC_KEY on the server.
-- Never select this table from the browser. No email or channel subscriber data.

create table if not exists public.youtube_oauth_tokens (
  id text primary key default 'studio',
  encrypted_payload text not null,
  channel_id text,
  channel_title text,
  updated_at timestamptz not null default now()
);

alter table public.youtube_oauth_tokens enable row level security;

comment on table public.youtube_oauth_tokens is
  'Server-only encrypted YouTube OAuth refresh/access tokens. Not PHI.';

create table if not exists public.youtube_upload_quota (
  day date primary key,
  upload_count integer not null default 0,
  units_used integer not null default 0,
  cap integer,
  updated_at timestamptz not null default now()
);

alter table public.youtube_upload_quota enable row level security;

comment on table public.youtube_upload_quota is
  'UTC daily Studio YouTube accounting. upload_count is videos.insert (own Google bucket, 100/day default, 1 unit/call as of 2026-09-15). units_used is the 10,000-unit pool for all other endpoints. YOUTUBE_DAILY_UPLOAD_CAP default 6 is an editorial cap, not a Google limit. Source: https://developers.google.com/youtube/v3/determine_quota_cost';
