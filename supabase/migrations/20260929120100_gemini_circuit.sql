-- SATCOM Gemini — per-workload circuit breaker.
-- PREVIEW ONLY. Do not apply this file to a live Supabase project from CI or an agent.

create table if not exists public.gemini_circuit (
  workload text primary key check (workload in ('video', 'copy', 'health')),
  state text not null check (state in ('closed', 'open', 'half_open')),
  failures integer not null default 0,
  opened_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.gemini_circuit enable row level security;

comment on table public.gemini_circuit is
  'Per-workload Gemini circuit breaker so a runaway copy loop cannot open the health circuit.';
