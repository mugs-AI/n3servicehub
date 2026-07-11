
-- Milestone 1.4 — jobs table additions for PIC tracking + contract snapshot at creation
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS created_by_user_code text,
  ADD COLUMN IF NOT EXISTS created_by_display_name text,
  ADD COLUMN IF NOT EXISTS created_by_user_type text,
  ADD COLUMN IF NOT EXISTS assigned_engineer_display_name text,
  ADD COLUMN IF NOT EXISTS assigned_engineer_user_type text,
  ADD COLUMN IF NOT EXISTS assigned_n3_user_id text,
  ADD COLUMN IF NOT EXISTS contract_status_at_creation text,
  ADD COLUMN IF NOT EXISTS contract_document_no_at_creation text,
  ADD COLUMN IF NOT EXISTS contract_expiry_at_creation date,
  ADD COLUMN IF NOT EXISTS internal_remark text,
  ADD COLUMN IF NOT EXISTS entry_mode text;

-- Allow draft status
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status = ANY (ARRAY['draft','pending','assigned','in_progress','waiting_customer','waiting_vendor','completed','cancelled','waiting_approval']));

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_created_by_user_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_created_by_user_type_check
  CHECK (created_by_user_type IS NULL OR created_by_user_type = ANY (ARRAY['n3_user','local_user','system']));

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_assigned_engineer_user_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_assigned_engineer_user_type_check
  CHECK (assigned_engineer_user_type IS NULL OR assigned_engineer_user_type = ANY (ARRAY['n3_user','local_user']));

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_entry_mode_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_entry_mode_check
  CHECK (entry_mode IS NULL OR entry_mode = ANY (ARRAY['standard','quick']));

CREATE INDEX IF NOT EXISTS jobs_tenant_customer_idx ON public.jobs(tenant_id, n3_customer_code, created_at DESC);
