-- Admin Security Hardening Migration
-- Establishes admin system, locks down RPCs, and hardens PVR verification.
-- Applied via apply_migration on 2026-07-16

-- ============================================================================
-- 1. ADMIN USERS TABLE
-- ============================================================================
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- ============================================================================
-- 2. IS_ADMIN FUNCTION
-- ============================================================================
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = p_user_id and active = true
  );
$$;

-- ============================================================================
-- 3. REVOKE ANON ACCESS TO RPCs, GRANT ONLY TO AUTHENTICATED
-- ============================================================================
revoke execute on function public.verify_pvr_mapping(text, uuid, text)
  from public, anon, authenticated;

revoke execute on function public.preview_pvr_mapping(text, uuid)
  from public, anon, authenticated;

grant execute on function public.verify_pvr_mapping(text, uuid, text)
  to authenticated;

grant execute on function public.preview_pvr_mapping(text, uuid)
  to authenticated;

-- ============================================================================
-- 4. ENHANCE PVR_MAPPING_AUDIT TABLE
-- ============================================================================
alter table public.pvr_mapping_audit
  add column if not exists total_players integer not null default 0,
  add column if not exists players_changed integer not null default 0,
  add column if not exists players_previously_null integer not null default 0,
  add column if not exists players_reassigned integer not null default 0,
  add column if not exists players_already_correct integer not null default 0,
  add column if not exists verified_by uuid references auth.users(id),
  add column if not exists request_id uuid;

-- ============================================================================
-- 5. REWRITE VERIFY_PVR_MAPPING WITH FULL SECURITY
-- ============================================================================
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
  v_user_id uuid;
  v_old_pvr_id uuid;
  v_was_verified boolean;
  v_total_players integer;
  v_players_previously_null integer;
  v_players_already_correct integer;
  v_players_reassigned integer;
  v_players_changed integer;
  v_action text;
  v_audit_id uuid;
  v_request_id uuid;
begin
  -- Authentication check
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Authorization check
  if not public.is_admin(v_user_id) then
    raise exception 'Admin privileges required' using errcode = '42501';
  end if;

  -- Input validation: reference code
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

  -- Input validation: PVR ID
  if p_pvr_id is null then
    raise exception 'PVR ID is required' using errcode = 'NT001';
  end if;

  if not exists (select 1 from public.pvrs where id = p_pvr_id) then
    raise exception 'PVR with id % does not exist', p_pvr_id using errcode = 'NT002';
  end if;

  -- Look up existing mapping
  select prm.pvr_id, prm.verified
  into v_old_pvr_id, v_was_verified
  from public.pvr_reference_map prm
  where prm.pvr_ref_code = v_normalized_code;

  v_was_verified := coalesce(v_was_verified, false);

  -- Count players and classify them
  select
    count(*),
    count(*) filter (where p.pvr_id is null),
    count(*) filter (where p.pvr_id = p_pvr_id),
    count(*) filter (where p.pvr_id is not null and p.pvr_id is distinct from p_pvr_id)
  into
    v_total_players,
    v_players_previously_null,
    v_players_already_correct,
    v_players_reassigned
  from public.players p
  where p.pvr_ref_code = v_normalized_code;

  -- Reason is mandatory when was_verified=true or players are being reassigned
  if (v_was_verified or v_players_reassigned > 0) then
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'Reason is required when modifying a verified mapping or reassigning players'
        using errcode = 'NT003';
    end if;
  end if;

  -- Determine action
  v_action := case when v_was_verified then 'update' else 'verify' end;

  -- Generate request ID for audit correlation
  v_request_id := gen_random_uuid();

  -- Upsert into pvr_reference_map
  insert into public.pvr_reference_map (
    pvr_ref_code, pvr_id, mapping_source, confidence, verified, notes
  ) values (
    v_normalized_code, p_pvr_id, 'admin_verification', 1, true, p_reason
  )
  on conflict (pvr_ref_code)
  do update set
    pvr_id = excluded.pvr_id,
    mapping_source = 'admin_verification',
    confidence = 1,
    verified = true,
    notes = case
      when public.pvr_reference_map.verified = true
      then coalesce(public.pvr_reference_map.notes || '; ', '') || 'Updated: ' || coalesce(p_reason, 'reverified')
      else coalesce(p_reason, public.pvr_reference_map.notes)
    end,
    updated_at = now();

  -- Update only players where pvr_id is distinct from target
  with updated as (
    update public.players p
    set pvr_id = p_pvr_id,
        updated_at = now()
    where p.pvr_ref_code = v_normalized_code
      and p.pvr_id is distinct from p_pvr_id
    returning p.id
  )
  select count(*) into v_players_changed from updated;

  -- Insert audit record
  insert into public.pvr_mapping_audit (
    pvr_ref_code,
    previous_pvr_id,
    new_pvr_id,
    action,
    affected_players,
    reason,
    total_players,
    players_changed,
    players_previously_null,
    players_reassigned,
    players_already_correct,
    verified_by,
    request_id
  ) values (
    v_normalized_code,
    v_old_pvr_id,
    p_pvr_id,
    v_action,
    v_players_changed,
    p_reason,
    v_total_players,
    v_players_changed,
    v_players_previously_null,
    v_players_reassigned,
    v_players_already_correct,
    v_user_id,
    v_request_id
  )
  returning id into v_audit_id;

  -- Return detailed result
  return jsonb_build_object(
    'success', true,
    'reference_code', v_normalized_code,
    'previous_pvr_id', v_old_pvr_id,
    'new_pvr_id', p_pvr_id,
    'was_verified', v_was_verified,
    'action', v_action,
    'total_players', v_total_players,
    'players_changed', v_players_changed,
    'players_previously_null', v_players_previously_null,
    'players_reassigned', v_players_reassigned,
    'players_already_correct', v_players_already_correct,
    'audit_id', v_audit_id,
    'verified_by', v_user_id,
    'created_at', now()
  );
exception
  when others then
    -- Atomic rollback is automatic; re-raise with context
    raise exception 'verify_pvr_mapping failed: % (SQLSTATE: %)', sqlerrm, sqlstate
      using errcode = sqlstate;
end;
$$;

-- ============================================================================
-- 6. REWRITE PREVIEW_PVR_MAPPING WITH AUTH CHECK
-- ============================================================================
create or replace function public.preview_pvr_mapping(
  p_reference_code text,
  p_pvr_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_normalized_code text;
  v_total_players integer;
  v_players_previously_null integer;
  v_players_already_correct integer;
  v_players_reassigned integer;
  v_old_pvr_id uuid;
  v_was_verified boolean;
begin
  -- Authentication check
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Authorization check
  if not public.is_admin(v_user_id) then
    raise exception 'Admin privileges required' using errcode = '42501';
  end if;

  -- Input validation: reference code
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

  -- Input validation: PVR ID
  if p_pvr_id is null then
    raise exception 'PVR ID is required' using errcode = 'NT001';
  end if;

  if not exists (select 1 from public.pvrs where id = p_pvr_id) then
    raise exception 'PVR with id % does not exist', p_pvr_id using errcode = 'NT002';
  end if;

  -- Look up existing mapping
  select prm.pvr_id, prm.verified
  into v_old_pvr_id, v_was_verified
  from public.pvr_reference_map prm
  where prm.pvr_ref_code = v_normalized_code;

  v_was_verified := coalesce(v_was_verified, false);

  -- Count and classify players
  select
    count(*),
    count(*) filter (where p.pvr_id is null),
    count(*) filter (where p.pvr_id = p_pvr_id),
    count(*) filter (where p.pvr_id is not null and p.pvr_id is distinct from p_pvr_id)
  into
    v_total_players,
    v_players_previously_null,
    v_players_already_correct,
    v_players_reassigned
  from public.players p
  where p.pvr_ref_code = v_normalized_code;

  return jsonb_build_object(
    'reference_code', v_normalized_code,
    'new_pvr_id', p_pvr_id,
    'previous_pvr_id', v_old_pvr_id,
    'was_verified', v_was_verified,
    'total_players', v_total_players,
    'players_previously_null', v_players_previously_null,
    'players_already_correct', v_players_already_correct,
    'players_reassigned', v_players_reassigned
  );
exception
  when others then
    raise exception 'preview_pvr_mapping failed: % (SQLSTATE: %)', sqlerrm, sqlstate
      using errcode = sqlstate;
end;
$$;

-- ============================================================================
-- 7. ENABLE RLS ON PVR_MAPPING_AUDIT
-- ============================================================================
alter table public.pvr_mapping_audit enable row level security;

-- Drop any existing policies first to ensure clean state
drop policy if exists "Admin select on pvr_mapping_audit"
  on public.pvr_mapping_audit;
drop policy if exists "Security definer insert on pvr_mapping_audit"
  on public.pvr_mapping_audit;

-- SELECT: only for authenticated admins
create policy "Admin select on pvr_mapping_audit"
  on public.pvr_mapping_audit
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- INSERT: only via SECURITY DEFINER functions (no direct INSERT from frontend)
-- By not creating an INSERT policy for any role, only SECURITY DEFINER functions
-- (which bypass RLS) can insert into this table.

-- ============================================================================
-- 8. ENABLE RLS ON ADMIN_USERS
-- ============================================================================
alter table public.admin_users enable row level security;

-- Drop any existing policies
drop policy if exists "Admin select on admin_users"
  on public.admin_users;
drop policy if exists "First admin bootstrap insert on admin_users"
  on public.admin_users;

-- SELECT: only for authenticated admins
create policy "Admin select on admin_users"
  on public.admin_users
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- INSERT: only for first admin bootstrap (allow when table is empty)
-- Once the first admin exists, subsequent inserts must be done by an existing admin
-- via a SECURITY DEFINER function or direct DB access.
create policy "First admin bootstrap insert on admin_users"
  on public.admin_users
  for insert
  to authenticated
  with check (
    not exists (select 1 from public.admin_users)
  );
