-- Secure PVR verification: remove anon update, add RPC + audit
-- Applied via apply_migration on 2026-07-15

-- 1. Remove dangerous anon update policy
drop policy if exists "Allow anon update pvr_reference_map" on public.pvr_reference_map;

-- 2. Create PVR mapping audit table
create table if not exists public.pvr_mapping_audit (
  id uuid primary key default gen_random_uuid(),
  pvr_ref_code text not null,
  previous_pvr_id uuid,
  new_pvr_id uuid not null,
  action text not null check (action in ('verify', 'update', 'unverify')),
  affected_players integer not null default 0,
  reason text,
  created_at timestamptz not null default now()
);

-- 3. Create secure RPC for verifying PVR mappings
create or replace function public.verify_pvr_mapping(
  p_reference_code text,
  p_pvr_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_pvr_id uuid;
  v_existing_verified boolean;
  v_affected integer;
begin
  select pvr_id, verified
  into v_old_pvr_id, v_existing_verified
  from public.pvr_reference_map
  where pvr_ref_code = p_reference_code;

  insert into public.pvr_reference_map (pvr_ref_code, pvr_id, mapping_source, confidence, verified, notes)
  values (p_reference_code, p_pvr_id, 'admin_verification', 1, true, p_reason)
  on conflict (pvr_ref_code)
  do update set
    pvr_id = excluded.pvr_id,
    mapping_source = 'admin_verification',
    confidence = 1,
    verified = true,
    notes = case when pvr_reference_map.verified = true
      then coalesce(pvr_reference_map.notes || '; ', '') || 'Updated: ' || coalesce(p_reason, 'reverified')
      else coalesce(p_reason, pvr_reference_map.notes)
    end,
    updated_at = now();

  with updated as (
    update public.players
    set pvr_id = p_pvr_id,
        updated_at = now()
    where pvr_ref_code = p_reference_code
    returning id
  )
  select count(*) into v_affected from updated;

  insert into public.pvr_mapping_audit (
    pvr_ref_code, previous_pvr_id, new_pvr_id, action,
    affected_players, reason
  ) values (
    p_reference_code,
    case when v_existing_verified then v_old_pvr_id else null end,
    p_pvr_id,
    case when v_existing_verified then 'update' else 'verify' end,
    v_affected,
    p_reason
  );

  return jsonb_build_object(
    'success', true,
    'reference_code', p_reference_code,
    'pvr_id', p_pvr_id,
    'previous_pvr_id', v_old_pvr_id,
    'was_verified', coalesce(v_existing_verified, false),
    'affected_players', v_affected,
    'action', case when v_existing_verified then 'update' else 'verify' end
  );
end;
$$;

-- 4. Create RPC for preview (impact analysis, no changes)
create or replace function public.preview_pvr_mapping(
  p_reference_code text,
  p_pvr_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_null_pvr integer;
  v_same_pvr integer;
  v_diff_pvr integer;
  v_old_pvr_id uuid;
  v_old_verified boolean;
begin
  select pvr_id, verified
  into v_old_pvr_id, v_old_verified
  from public.pvr_reference_map
  where pvr_ref_code = p_reference_code;

  select
    count(*),
    count(*) filter (where pvr_id is null),
    count(*) filter (where pvr_id = p_pvr_id),
    count(*) filter (where pvr_id is not null and pvr_id != p_pvr_id)
  into v_total, v_null_pvr, v_same_pvr, v_diff_pvr
  from public.players
  where pvr_ref_code = p_reference_code;

  return jsonb_build_object(
    'reference_code', p_reference_code,
    'new_pvr_id', p_pvr_id,
    'old_pvr_id', v_old_pvr_id,
    'was_verified', coalesce(v_old_verified, false),
    'total_players', v_total,
    'players_with_null_pvr', v_null_pvr,
    'players_with_same_pvr', v_same_pvr,
    'players_with_different_pvr', v_diff_pvr
  );
end;
$$;

grant execute on function public.verify_pvr_mapping(text, uuid, text) to anon, authenticated;
grant execute on function public.preview_pvr_mapping(text, uuid) to anon, authenticated;
