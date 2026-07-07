
-- 1. JOBS: status + priority
ALTER TABLE public.jobs ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.jobs ALTER COLUMN priority DROP DEFAULT;

ALTER TABLE public.jobs
  ALTER COLUMN status TYPE TEXT USING status::text,
  ALTER COLUMN priority TYPE TEXT USING priority::text;

UPDATE public.jobs SET status = 'pending'   WHERE status IN ('draft','open','on_hold');
UPDATE public.jobs SET status = 'completed' WHERE status = 'invoiced';
UPDATE public.jobs SET priority = 'medium'  WHERE priority IN ('normal','urgent');

ALTER TABLE public.jobs
  ALTER COLUMN status   SET DEFAULT 'pending',
  ALTER COLUMN priority SET DEFAULT 'medium';

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_status_check CHECK (status IN (
    'pending','assigned','in_progress','waiting_customer',
    'waiting_vendor','completed','cancelled','waiting_approval'
  )),
  ADD CONSTRAINT jobs_priority_check CHECK (priority IN ('low','medium','high'));

DROP TYPE IF EXISTS public.job_status;
DROP TYPE IF EXISTS public.job_priority;

-- 2. JOBS: approval fields
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_status   TEXT    NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approval_type     TEXT    NULL,
  ADD COLUMN IF NOT EXISTS approved_by       UUID    NULL REFERENCES public.users_local(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS approval_note     TEXT    NULL,
  ADD COLUMN IF NOT EXISTS job_service_type  TEXT    NULL;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_approval_status_check CHECK (approval_status IN (
    'not_required','waiting_approval','approved','rejected'
  )),
  ADD CONSTRAINT jobs_approval_type_check CHECK (approval_type IS NULL OR approval_type IN (
    'ad_hoc_service','newly_renewed_contract'
  )),
  ADD CONSTRAINT jobs_service_type_check CHECK (job_service_type IS NULL OR job_service_type IN (
    'contract_support','ad_hoc_service','renewal_follow_up'
  ));

CREATE INDEX IF NOT EXISTS idx_jobs_tenant_approval_status ON public.jobs(tenant_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_service_type    ON public.jobs(tenant_id, job_service_type);

-- 3. renewal_mapping: stock-based
ALTER TABLE public.renewal_mapping
  DROP CONSTRAINT IF EXISTS renewal_mapping_tenant_id_n3_customer_id_n3_stock_id_key;

ALTER TABLE public.renewal_mapping
  DROP COLUMN IF EXISTS n3_customer_id,
  DROP COLUMN IF EXISTS n3_customer_code,
  DROP COLUMN IF EXISTS start_date,
  DROP COLUMN IF EXISTS next_due_date,
  DROP COLUMN IF EXISTS last_generated_at,
  DROP COLUMN IF EXISTS interval_type,
  DROP COLUMN IF EXISTS interval_days;

ALTER TABLE public.renewal_mapping
  ADD COLUMN IF NOT EXISTS n3_stock_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS service_type  TEXT NOT NULL DEFAULT 'others',
  ADD COLUMN IF NOT EXISTS contract_days INTEGER NULL;

ALTER TABLE public.renewal_mapping
  ADD CONSTRAINT renewal_mapping_service_type_check CHECK (service_type IN (
    'annual_renewal','ad_hoc','implementation','training',
    'warranty','installation','internal','others'
  ));

DROP TYPE IF EXISTS public.renewal_interval;

CREATE UNIQUE INDEX IF NOT EXISTS renewal_mapping_tenant_stock_uniq
  ON public.renewal_mapping(tenant_id, n3_stock_code);
CREATE INDEX IF NOT EXISTS idx_renewal_mapping_tenant_service
  ON public.renewal_mapping(tenant_id, service_type);

-- 4. customer_contract_snapshots
CREATE TABLE IF NOT EXISTS public.customer_contract_snapshots (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  n3_customer_id                TEXT NULL,
  n3_customer_code              TEXT NOT NULL,
  n3_customer_name              TEXT NULL,
  latest_contract_source        TEXT NULL,
  latest_contract_document_no   TEXT NULL,
  latest_contract_document_id   TEXT NULL,
  latest_contract_date          DATE NULL,
  latest_contract_stock_code    TEXT NULL,
  contract_days                 INTEGER NULL,
  expiry_date                   DATE NULL,
  remaining_days                INTEGER NULL,
  contract_status               TEXT NOT NULL DEFAULT 'unknown',
  last_calculated_at            TIMESTAMPTZ NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ccs_status_check CHECK (contract_status IN (
    'active','due_soon','overdue','pending_renewal_confirmation','unknown'
  )),
  CONSTRAINT ccs_tenant_customer_uniq UNIQUE (tenant_id, n3_customer_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contract_snapshots TO authenticated;
GRANT ALL ON public.customer_contract_snapshots TO service_role;

ALTER TABLE public.customer_contract_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccs tenant members read"
  ON public.customer_contract_snapshots FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "ccs admins manage"
  ON public.customer_contract_snapshots FOR ALL
  TO authenticated
  USING (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin','manager']::user_local_role[]))
  WITH CHECK (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin','manager']::user_local_role[]));

CREATE INDEX IF NOT EXISTS idx_ccs_tenant_status   ON public.customer_contract_snapshots(tenant_id, contract_status);
CREATE INDEX IF NOT EXISTS idx_ccs_tenant_expiry   ON public.customer_contract_snapshots(tenant_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_ccs_tenant_customer ON public.customer_contract_snapshots(tenant_id, n3_customer_code);

CREATE TRIGGER tg_ccs_updated_at
  BEFORE UPDATE ON public.customer_contract_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5. reminder_rules
CREATE TABLE IF NOT EXISTS public.reminder_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_name           TEXT NULL,
  days_before_expiry  INTEGER NOT NULL,
  status_to_apply     TEXT NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reminder_rules_status_check CHECK (status_to_apply IN (
    'active','due_soon','overdue','pending_renewal_confirmation','unknown'
  ))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_rules TO authenticated;
GRANT ALL ON public.reminder_rules TO service_role;

ALTER TABLE public.reminder_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminder_rules tenant members read"
  ON public.reminder_rules FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "reminder_rules admins manage"
  ON public.reminder_rules FOR ALL
  TO authenticated
  USING (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]))
  WITH CHECK (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]));

CREATE INDEX IF NOT EXISTS idx_reminder_rules_tenant ON public.reminder_rules(tenant_id, is_active);

CREATE TRIGGER tg_reminder_rules_updated_at
  BEFORE UPDATE ON public.reminder_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 6. job_attachments
CREATE TABLE IF NOT EXISTS public.job_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id       UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  uploaded_by  UUID NULL REFERENCES public.users_local(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_attachments TO authenticated;
GRANT ALL ON public.job_attachments TO service_role;

ALTER TABLE public.job_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_attachments tenant members read"
  ON public.job_attachments FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "job_attachments tenant members insert"
  ON public.job_attachments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE POLICY "job_attachments admins manage"
  ON public.job_attachments FOR ALL
  TO authenticated
  USING (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin','manager']::user_local_role[]))
  WITH CHECK (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin','manager']::user_local_role[]));

CREATE INDEX IF NOT EXISTS idx_job_attachments_tenant_job ON public.job_attachments(tenant_id, job_id);

-- 7. activity_logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_code     TEXT NULL,
  user_type     TEXT NULL,
  action        TEXT NOT NULL,
  entity_type   TEXT NULL,
  entity_id     TEXT NULL,
  before_value  JSONB NULL,
  after_value   JSONB NULL,
  result        TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs tenant members read"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "activity_logs tenant members insert"
  ON public.activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_created ON public.activity_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_entity  ON public.activity_logs(tenant_id, entity_type, entity_id);
