-- Add normalized content hash for content-based deduplication
-- Handles files with same data but different Excel metadata (different binary hash)

alter table public.excel_uploads
  add column if not exists normalized_hash text null;

create index if not exists idx_excel_uploads_normalized_hash
  on public.excel_uploads(normalized_hash)
  where normalized_hash is not null;
