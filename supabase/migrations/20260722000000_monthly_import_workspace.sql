-- Monthly Import Workspace migration
alter table public.excel_uploads
  add column if not exists analysis_month date null,
  add column if not exists detected_months text[] null,
  add column if not exists month_validation_status text null,
  add column if not exists expected_file_type text null;

create index if not exists idx_excel_uploads_month_type
  on public.excel_uploads (analysis_month, file_type, uploaded_at desc);
