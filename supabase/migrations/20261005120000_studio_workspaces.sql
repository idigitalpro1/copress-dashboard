-- Studio workspaces (codex#109): "My properties" + one workspace per client (Paul Hill first).
-- PREVIEW ONLY. Do not apply this file to a live Supabase project from CI or an agent.
-- Patrick (or an operator) applies it to the chosen Preview project after review.
--
-- ADDITIVE ONLY: adds nullable/defaulted columns and indexes, then backfills. Nothing is
-- dropped, renamed or retyped, and the app works with or without this file applied
-- (code only writes workspace_id for client workspaces and filters in code).
-- Reverse with supabase/rollbacks/20261005120000_studio_workspaces.down.sql.
--
-- Workspace ids come from lib/video-studio/workspaces.js: 'my-properties', 'paul-hill'.
-- No PHI is stored here.

-- 1. YouTube channel connection per workspace.
-- Existing row id 'studio' is the My properties connection and is NOT renamed. Client
-- workspaces use id 'studio:<workspace>' (e.g. 'studio:paul-hill'), written by the app.
alter table public.youtube_oauth_tokens
  add column if not exists workspace_id text;

update public.youtube_oauth_tokens
  set workspace_id = 'my-properties'
  where id = 'studio' and workspace_id is null;

create unique index if not exists youtube_oauth_tokens_workspace_uidx
  on public.youtube_oauth_tokens (workspace_id)
  where workspace_id is not null;

-- 2. Publish queue per workspace. Existing rows default to My properties.
alter table public.video_publish_jobs
  add column if not exists workspace_id text not null default 'my-properties';

-- Paul Hill clips that have NOT been uploaded yet move to his workspace. Jobs that already
-- hold a youtube_video_id were uploaded with the existing (My properties) channel token, so
-- they stay with it; otherwise unpublish would look for the video on the wrong channel.
update public.video_publish_jobs
  set workspace_id = 'paul-hill'
  where starts_with(asset_public_id, 'satcom/paul-hill/')
    and youtube_video_id is null
    and workspace_id = 'my-properties';

create index if not exists video_publish_jobs_workspace_idx
  on public.video_publish_jobs (workspace_id, updated_at desc);

-- 3. Review gate records per workspace (checkboxes only, no copy text).
alter table public.video_publish_reviews
  add column if not exists workspace_id text not null default 'my-properties';

update public.video_publish_reviews
  set workspace_id = 'paul-hill'
  where starts_with(asset_public_id, 'satcom/paul-hill/')
    and workspace_id = 'my-properties';

comment on column public.youtube_oauth_tokens.workspace_id is
  'Studio workspace that owns this YouTube channel connection. Row id studio = my-properties.';
comment on column public.video_publish_jobs.workspace_id is
  'Studio workspace (publish queue) the job belongs to.';
comment on column public.video_publish_reviews.workspace_id is
  'Studio workspace the review belongs to.';
