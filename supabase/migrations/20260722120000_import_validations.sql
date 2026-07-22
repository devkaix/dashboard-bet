-- Import validation tracking table
-- Stores reconciliation results between operational files and control files.

CREATE TABLE IF NOT EXISTS public.import_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid REFERENCES public.excel_uploads(id) ON DELETE CASCADE,
  source_file_type text NOT NULL,
  target_file_type text,
  analysis_month date,
  period_start date,
  period_end date,
  metric text,
  operational_value numeric,
  control_value numeric,
  absolute_diff numeric,
  percent_diff numeric,
  status text NOT NULL CHECK (status IN ('PASS', 'WARNING', 'BLOCKED', 'NOT_AVAILABLE', 'SKIPPED')),
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_validations_upload_id
  ON public.import_validations(upload_id);

CREATE INDEX IF NOT EXISTS idx_import_validations_analysis_month
  ON public.import_validations(analysis_month, source_file_type, target_file_type);

-- Grant access (internal app, RLS open for now)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_validations TO anon, authenticated;
