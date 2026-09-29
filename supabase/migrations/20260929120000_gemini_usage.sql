-- SATCOM Gemini copy usage log.
-- PREVIEW ONLY. Do not apply this file to a live Supabase project from CI or an agent.
-- Patrick (or an operator) applies it to the chosen Preview project after review.
--
-- This table holds NO PHI. For health (formerly ask_susan), callers must store
-- counts and dollars only. Never put prompt text, response text, names, or
-- medical content in metadata.
--
-- This Vercel app writes copy rows. video/health exist so budgets stay isolated
-- if Patrick's server later shares a Preview project. Omni jobs are NOT stored
-- here; generation lives on Patrick's server.

create table if not exists public.gemini_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workload text not null check (workload in ('video', 'copy', 'health')),
  model text not null,
  input_tokens integer,
  output_tokens integer,
  video_seconds numeric,
  estimated_usd numeric(12, 6),
  status text not null,
  latency_ms integer,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists gemini_usage_workload_created_idx
  on public.gemini_usage (workload, created_at desc);

alter table public.gemini_usage enable row level security;
-- No anon/authenticated policies: only the service role (which bypasses RLS) may read or write.

comment on table public.gemini_usage is
  'Gemini API cost/usage log. health rows must contain counts and dollars only — never prompt or response text.';
