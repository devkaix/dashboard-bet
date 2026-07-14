-- Allow the app to auto-create unverified PVR reference mappings during daily_pvr imports.
-- Verified mappings remain protected because only unverified rows can be inserted.

 drop policy if exists "Allow anon select on pvr_reference_map" on public.pvr_reference_map;
 drop policy if exists "Allow anon insert unverified pvr_reference_map" on public.pvr_reference_map;

create policy "Allow anon select on pvr_reference_map"
  on public.pvr_reference_map
  for select
  to anon, authenticated
  using (true);

create policy "Allow anon insert unverified pvr_reference_map"
  on public.pvr_reference_map
  for insert
  to anon, authenticated
  with check (verified = false and mapping_source is not null and mapping_source <> '');
