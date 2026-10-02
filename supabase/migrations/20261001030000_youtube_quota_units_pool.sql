-- Additive units_used column for Preview projects that already applied
-- 20260929200100_youtube_oauth_and_quota.sql. PREVIEW ONLY. Do not apply
-- this file to a live Supabase project from CI or an agent.
--
-- Google quota model (https://developers.google.com/youtube/v3/determine_quota_cost,
-- last updated 2026-09-15 UTC): videos.insert and search.list have their own
-- 100/day buckets at 1 unit/call. The 10,000 units/day pool is for every other
-- endpoint. The old 1,600 units/upload figure is obsolete.

alter table if exists public.youtube_upload_quota
  add column if not exists units_used integer not null default 0;

comment on table public.youtube_upload_quota is
  'UTC daily Studio YouTube accounting. upload_count is videos.insert (own Google bucket, 100/day default, 1 unit/call as of 2026-09-15). units_used is the 10,000-unit pool for all other endpoints. YOUTUBE_DAILY_UPLOAD_CAP default 6 is an editorial cap, not a Google limit. Source: https://developers.google.com/youtube/v3/determine_quota_cost';
