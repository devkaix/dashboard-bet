-- Enterprise Realignment Migration
-- Adds real-data tracking, removes synthetic data hooks, and supports controlled PVR reconciliation.

-- ─── Players: real-data columns ───
alter table public.players
  add column if not exists pvr_id uuid null references public.pvrs(id) on delete set null,
  add column if not exists pvr_ref_code text null,
  add column if not exists kyc_status text null,
  add column if not exists balance numeric(14,2) null,
  add column if not exists withdrawable_balance numeric(14,2) null,
  add column if not exists registration_date timestamptz null,
  add column if not exists username_normalized text null;

-- Backfill username_normalized
update public.players
set username_normalized = lower(trim(username))
where username_normalized is null;

-- Index for fast normalized username lookup (no unique constraint until duplicates are confirmed absent)
create index if not exists idx_players_username_normalized
  on public.players(username_normalized);

-- ─── PVR reference map for verified PVR ref code → PVR id mappings ───
create table if not exists public.pvr_reference_map (
  pvr_ref_code text primary key,
  pvr_id uuid not null references public.pvrs(id) on delete cascade,
  mapping_source text not null,
  confidence numeric(5,4) not null default 1,
  verified boolean not null default false,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Player username aliases for verified alternate spellings ───
create table if not exists public.player_username_aliases (
  alias_normalized text primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  source text null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── Excel uploads: deduplication and validation tracking ───
alter table public.excel_uploads
  add column if not exists file_hash text null,
  add column if not exists period_start date null,
  add column if not exists period_end date null,
  add column if not exists validation_status text null,
  add column if not exists validation_report jsonb null;

-- Prevent duplicate completed uploads of the same file content
create unique index if not exists excel_uploads_file_hash_unique
  on public.excel_uploads(file_hash)
  where file_hash is not null
  and status = 'completed';

-- ─── Monthly player stats view (validation source for player_summary files) ───
create or replace view public.monthly_player_stats_v as
select
  player_id,
  date_trunc('month', date)::date as month,
  sum(buy_in) as buy_in,
  sum(buy_in_bonus) as buy_in_bonus,
  sum(stack) as stack,
  sum(bet) as bet,
  sum(won) as won,
  sum(rake) as rake,
  sum(payout) as payout,
  sum(bet_bonus) as bet_bonus,
  sum(jackpot) as jackpot,
  sum(jackpot_won) as jackpot_won,
  sum(overlay) as overlay,
  sum(refund) as refund,
  count(distinct date) as active_days
from public.daily_player_stats
group by player_id, date_trunc('month', date)::date;

-- ─── Updated-at helper ───
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at trigger to pvr_reference_map
 drop trigger if exists pvr_reference_map_updated_at on public.pvr_reference_map;
create trigger pvr_reference_map_updated_at
  before update on public.pvr_reference_map
  for each row execute function public.set_updated_at();

-- ─── RLS policies ───
alter table public.pvr_reference_map enable row level security;
alter table public.player_username_aliases enable row level security;

-- Allow anon read/insert/update for app compatibility (to be tightened after auth implementation)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'pvr_reference_map' and policyname = 'Allow all on pvr_reference_map'
  ) then
    create policy "Allow all on pvr_reference_map"
      on public.pvr_reference_map
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'player_username_aliases' and policyname = 'Allow all on player_username_aliases'
  ) then
    create policy "Allow all on player_username_aliases"
      on public.player_username_aliases
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'excel_uploads' and policyname = 'Allow all on excel_uploads'
  ) then
    create policy "Allow all on excel_uploads"
      on public.excel_uploads
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end
$$;
