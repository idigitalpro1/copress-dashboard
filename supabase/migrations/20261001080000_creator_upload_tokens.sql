-- Optional creator-upload token store. Service-role only.
-- Do not apply this file to a live Supabase project from CI or an agent.
-- Tokens are stored as SHA-256 hashes (creator-upload-v1:<token>), never the raw secret.
-- Env var CREATOR_UPLOAD_TOKENS remains the default; this table is an extra revoke path.

create table if not exists public.creator_upload_tokens (
  token_hash text primary key,
  creator_slug text not null,
  creator_name text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.creator_upload_tokens enable row level security;

comment on table public.creator_upload_tokens is
  'Hashed creator upload links. RLS on; no policies. Service-role reads only. No raw tokens, no PHI.';
