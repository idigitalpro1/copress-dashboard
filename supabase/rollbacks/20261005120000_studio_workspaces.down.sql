-- Rollback for supabase/migrations/20261005120000_studio_workspaces.sql.
-- PREVIEW ONLY. Not applied automatically; this file lives outside migrations/ on purpose.
--
-- Drops only what the up-migration added. The legacy 'studio' token row and every existing
-- column are untouched, so My properties keeps working. Client workspace token rows
-- ('studio:<workspace>') written by the app are removed because they cannot be used without
-- the workspace columns; reconnect the client channel after re-applying the migration.

drop index if exists public.video_publish_jobs_workspace_idx;
alter table public.video_publish_jobs drop column if exists workspace_id;

alter table public.video_publish_reviews drop column if exists workspace_id;

drop index if exists public.youtube_oauth_tokens_workspace_uidx;
delete from public.youtube_oauth_tokens where id like 'studio:%';
alter table public.youtube_oauth_tokens drop column if exists workspace_id;
