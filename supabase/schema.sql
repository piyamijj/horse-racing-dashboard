-- Supabase schema for the Horse Racing Prediction Dashboard.
-- Run this once in the Supabase SQL editor (or via `supabase db push`)
-- before pointing the app at SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
--
-- Mirrors the shapes read/written by lib/supabase.ts. The scrape step
-- (/api/scrape) writes into `races`; the predict step (/api/predict)
-- reads `races` and writes into `predictions` — the two are decoupled
-- so a prediction request never triggers a live scrape.

create table if not exists races (
  id               text primary key,
  track            text not null,
  race_number      integer not null,
  name             text not null,
  start_time       timestamptz not null,
  distance_meters  integer not null,
  surface          text not null,
  condition        text,
  horses           jsonb not null default '[]'::jsonb,
  scraped_at       timestamptz not null default now()
);

create index if not exists idx_races_start_time on races (start_time);

create table if not exists predictions (
  race_id       text primary key references races (id) on delete cascade,
  generated_at  timestamptz not null default now(),
  provider      text not null,
  model         text not null,
  predictions   jsonb not null default '[]'::jsonb
);

create index if not exists idx_predictions_generated_at on predictions (generated_at);

-- Row Level Security: enabled with a permissive read policy for the anon key
-- (dashboard reads), while writes only ever go through the service role key
-- from /api/scrape and /api/predict (which bypasses RLS by default).
alter table races enable row level security;
alter table predictions enable row level security;

drop policy if exists "Public read access to races" on races;
create policy "Public read access to races"
  on races for select
  using (true);

drop policy if exists "Public read access to predictions" on predictions;
create policy "Public read access to predictions"
  on predictions for select
  using (true);