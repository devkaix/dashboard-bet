-- Remove admin system and simplify PVR mapping RPCs for internal use
-- No authentication/authorization required anymore

-- 1. Drop admin-related RLS policies ---------------------------------------
drop policy if exists "Admin select on pvr_mapping_audit" on public.pvr_mapping_audit;
drop policy if exists "Admin select on admin_users" on public.admin_users;
drop policy if exists "First admin bootstrap insert on admin_users" on public.admin_users;

-- 2. Drop dependent functions and admin users table -------------------------
drop function if exists public.is_admin(uuid) cascade;
drop table if exists public.admin_users cascade;

-- 3. Remove foreign key and not-null constraints from audit -----------------
alter table public.pvr_mapping_audit
  drop constraint if exists pvr_mapping_audit_verified_by_fkey,
  alter column verified_by drop not null;

-- 4. Simplify preview_pvr_mapping (no auth) ---------------------------------
create or replace function public.preview_pvr_mapping(
  p_reference_code text,
  p_pvr_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_code text;
  v_total integer;
  v_null_pvr integer;
  v_same_pvr integer;
  v_diff_pvr integer;
  v_old_pvr_id uuid;
  v_old_verified boolean;
begin
  if p_reference_code is null then
    raise exception 'Reference code is required' using errcode = 'NT001';
  end if;

  v_normalized_code := upper(trim(p_reference_code));

  if v_normalized_code = '' then
    raise exception 'Reference code must not be empty' using errcode = 'NT001';
  end if;

  if length(v_normalized_code) > 100 then
    raise exception 'Reference code must not exceed 100 characters' using errcode = 'NT001';
  end if;

  if p_pvr_id is null then
    raise exception 'PVR ID is required' using errcode = 'NT001';
  end if;

  if not exists (select 1 from public.pvrs where id = p_pvr_id) then
    raise exception 'PVR with id % does not exist', p_pvr_id using errcode = 'NT002';
  end if;

  select pvr_id, verified
  into v_old_pvr_id, v_old_verified
  from public.pvr_reference_map
  where pvr_ref_code = v_normalized_code;

  select
    count(*),
    count(*) filter (where pvr_id is null),
    count(*) filter (where pvr_id = p_pvr_id),
    count(*) filter (where pvr_id is not null and pvr_id != p_pvr_id)
  into v_total, v_null_pvr, v_same_pvr, v_diff_pvr
  from public.players
  where pvr_ref_code = v_normalized_code;

  return jsonb_build_object(
    'reference_code', v_normalized_code,
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

-- 5. Simplify verify_pvr_mapping (no auth, reason optional) -----------------
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
  v_normalized_code text;
  v_old_pvr_id uuid;
  v_existing_verified boolean;
  v_affected integer;
  v_action text;
  v_audit_id uuid;
begin
  if p_reference_code is null then
    raise exception 'Reference code is required' using errcode = 'NT001';
  end if;

  v_normalized_code := upper(trim(p_reference_code));

  if v_normalized_code = '' then
    raise exception 'Reference code must not be empty' using errcode = 'NT001';
  end if;

  if length(v_normalized_code) > 100 then
    raise exception 'Reference code must not exceed 100 characters' using errcode = 'NT001';
  end if;

  if p_pvr_id is null then
    raise exception 'PVR ID is required' using errcode = 'NT001';
  end if;

  if not exists (select 1 from public.pvrs where id = p_pvr_id) then
    raise exception 'PVR with id % does not exist', p_pvr_id using errcode = 'NT002';
  end if;

  select pvr_id, verified
  into v_old_pvr_id, v_existing_verified
  from public.pvr_reference_map
  where pvr_ref_code = v_normalized_code;

  v_action := case when coalesce(v_existing_verified, false) then 'update' else 'verify' end;

  insert into public.pvr_reference_map (
    pvr_ref_code, pvr_id, mapping_source, confidence, verified, notes
  ) values (
    v_normalized_code, p_pvr_id, 'manual_mapping', 1, true, p_reason
  )
  on conflict (pvr_ref_code)
  do update set
    pvr_id = excluded.pvr_id,
    mapping_source = 'manual_mapping',
    confidence = 1,
    verified = true,
    notes = case
      when public.pvr_reference_map.verified = true
      then coalesce(public.pvr_reference_map.notes || '; ', '') || 'Updated: ' || coalesce(p_reason, 'reverified')
      else coalesce(p_reason, public.pvr_reference_map.notes)
    end,
    updated_at = now();

  with updated as (
    update public.players
    set pvr_id = p_pvr_id,
        updated_at = now()
    where pvr_ref_code = v_normalized_code
      and pvr_id is distinct from p_pvr_id
    returning id
  )
  select count(*) into v_affected from updated;

  -- Also sync tickets for this reference code
  update public.tickets
  set pvr_id = p_pvr_id
  where upper(trim(pvr_code)) = v_normalized_code
    and pvr_id is distinct from p_pvr_id;

  insert into public.pvr_mapping_audit (
    pvr_ref_code, previous_pvr_id, new_pvr_id, action,
    affected_players, reason
  ) values (
    v_normalized_code,
    case when coalesce(v_existing_verified, false) then v_old_pvr_id else null end,
    p_pvr_id,
    v_action,
    v_affected,
    p_reason
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'reference_code', v_normalized_code,
    'pvr_id', p_pvr_id,
    'previous_pvr_id', v_old_pvr_id,
    'was_verified', coalesce(v_existing_verified, false),
    'affected_players', v_affected,
    'action', v_action,
    'audit_id', v_audit_id
  );
end;
$$;

-- 6. Ensure RPCs are accessible to anonymous/internal users -----------------
grant execute on function public.preview_pvr_mapping(text, uuid) to anon, authenticated;
grant execute on function public.verify_pvr_mapping(text, uuid, text) to anon, authenticated;
