-- Allow the dashboard to confirm/edit PVR reference mappings (set verified = true).

drop policy if exists "Allow anon update pvr_reference_map" on public.pvr_reference_map;

create policy "Allow anon update pvr_reference_map"
  on public.pvr_reference_map
  for update
  to anon, authenticated
  using (true)
  with check (true);
