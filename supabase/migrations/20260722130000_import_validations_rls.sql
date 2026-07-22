-- Enable RLS on import_validations and add permissive policies for app access.
-- The upload UI runs with the anon key, so anon needs full access to this audit table.

alter table public.import_validations enable row level security;

create policy "Allow anon select import_validations"
  on public.import_validations
  for select
  to anon, authenticated
  using (true);

create policy "Allow anon insert import_validations"
  on public.import_validations
  for insert
  to anon, authenticated
  with check (true);

create policy "Allow anon update import_validations"
  on public.import_validations
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "Allow anon delete import_validations"
  on public.import_validations
  for delete
  to anon, authenticated
  using (true);
