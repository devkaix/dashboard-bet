-- Tighten RLS on mapping and upload tables.
-- Mapping tables become read-only for the app; upload table allows read/insert only.

-- pvr_reference_map
 drop policy if exists "Allow all on pvr_reference_map" on public.pvr_reference_map;
create policy "Allow anon select on pvr_reference_map"
  on public.pvr_reference_map
  for select
  to anon, authenticated
  using (true);

-- player_username_aliases
 drop policy if exists "Allow all on player_username_aliases" on public.player_username_aliases;
create policy "Allow anon select on player_username_aliases"
  on public.player_username_aliases
  for select
  to anon, authenticated
  using (true);

-- excel_uploads
 drop policy if exists "Allow all on excel_uploads" on public.excel_uploads;
create policy "Allow anon select on excel_uploads"
  on public.excel_uploads
  for select
  to anon, authenticated
  using (true);

create policy "Allow anon insert on excel_uploads"
  on public.excel_uploads
  for insert
  to anon, authenticated
  with check (true);
