
-- ============================================================
-- Milestone 1.2.8 — Approval Rules, Access Profiles, Report Access
-- ============================================================

-- ----- approval_rules -----
CREATE TABLE public.approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_status TEXT NOT NULL CHECK (customer_status IN ('active','due_soon','overdue','suspended','unknown')),
  can_create_job BOOLEAN NOT NULL DEFAULT true,
  initial_job_status TEXT NOT NULL CHECK (initial_job_status IN ('draft','pending')),
  approval_required BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_status)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_rules TO authenticated;
GRANT ALL ON public.approval_rules TO service_role;
ALTER TABLE public.approval_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_rules_read ON public.approval_rules
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY approval_rules_write ON public.approval_rules
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]))
  WITH CHECK (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]));

CREATE TRIGGER trg_approval_rules_updated_at
  BEFORE UPDATE ON public.approval_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ----- access_profile_permissions -----
CREATE TABLE public.access_profile_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_code TEXT NOT NULL CHECK (profile_code IN ('administrator','support','engineer')),
  permission_code TEXT NOT NULL,
  is_allowed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, profile_code, permission_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_profile_permissions TO authenticated;
GRANT ALL ON public.access_profile_permissions TO service_role;
ALTER TABLE public.access_profile_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_perms_read ON public.access_profile_permissions
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY app_perms_write ON public.access_profile_permissions
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]))
  WITH CHECK (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]));

CREATE TRIGGER trg_app_perms_updated_at
  BEFORE UPDATE ON public.access_profile_permissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ----- report_access_rules -----
CREATE TABLE public.report_access_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_code TEXT NOT NULL,
  report_name TEXT NOT NULL,
  visible_to_support BOOLEAN NOT NULL DEFAULT false,
  visible_to_engineer BOOLEAN NOT NULL DEFAULT false,
  allow_print_support BOOLEAN NOT NULL DEFAULT false,
  allow_print_engineer BOOLEAN NOT NULL DEFAULT false,
  allow_excel_support BOOLEAN NOT NULL DEFAULT false,
  allow_excel_engineer BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, report_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_access_rules TO authenticated;
GRANT ALL ON public.report_access_rules TO service_role;
ALTER TABLE public.report_access_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_access_read ON public.report_access_rules
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY report_access_write ON public.report_access_rules
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]))
  WITH CHECK (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]));

CREATE TRIGGER trg_report_access_updated_at
  BEFORE UPDATE ON public.report_access_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ----- Vendor ticket fields on jobs (Milestone 1.2.8 preparation) -----
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS vendor_referral_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendor_name TEXT,
  ADD COLUMN IF NOT EXISTS vendor_ticket_number TEXT,
  ADD COLUMN IF NOT EXISTS vendor_referred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vendor_status TEXT,
  ADD COLUMN IF NOT EXISTS vendor_follow_up_date DATE,
  ADD COLUMN IF NOT EXISTS vendor_resolution TEXT;

-- ============================================================
-- Seeding helpers: default rows for every tenant
-- ============================================================

CREATE OR REPLACE FUNCTION public.seed_tenant_access_defaults(_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Approval rules defaults
  INSERT INTO public.approval_rules (tenant_id, customer_status, initial_job_status, approval_required) VALUES
    (_tenant_id, 'active',    'pending', false),
    (_tenant_id, 'due_soon',  'pending', false),
    (_tenant_id, 'overdue',   'draft',   true),
    (_tenant_id, 'suspended', 'draft',   true),
    (_tenant_id, 'unknown',   'draft',   true)
  ON CONFLICT (tenant_id, customer_status) DO NOTHING;

  -- Access profile permissions defaults
  INSERT INTO public.access_profile_permissions (tenant_id, profile_code, permission_code, is_allowed) VALUES
    -- Support (recommended ON)
    (_tenant_id, 'support', 'view_support_dashboard', true),
    (_tenant_id, 'support', 'search_customers', true),
    (_tenant_id, 'support', 'view_customer_contract_status', true),
    (_tenant_id, 'support', 'create_standard_job', true),
    (_tenant_id, 'support', 'create_quick_job', true),
    (_tenant_id, 'support', 'view_all_jobs', true),
    (_tenant_id, 'support', 'edit_jobs', true),
    (_tenant_id, 'support', 'reassign_engineer', true),
    (_tenant_id, 'support', 'add_job_comments', true),
    (_tenant_id, 'support', 'upload_attachments', true),
    (_tenant_id, 'support', 'mark_waiting_customer', true),
    (_tenant_id, 'support', 'mark_waiting_vendor', true),
    (_tenant_id, 'support', 'complete_job', true),
    (_tenant_id, 'support', 'cancel_job', true),
    (_tenant_id, 'support', 'view_calendar', true),
    (_tenant_id, 'support', 'view_reports', true),
    (_tenant_id, 'support', 'print_reports', true),
    (_tenant_id, 'support', 'export_reports_excel', true),
    -- Support (recommended OFF)
    (_tenant_id, 'support', 'job_approval', false),
    (_tenant_id, 'support', 'settings', false),
    (_tenant_id, 'support', 'n3_writeback', false),
    (_tenant_id, 'support', 'pricing', false),

    -- Engineer (recommended ON)
    (_tenant_id, 'engineer', 'view_engineer_dashboard', true),
    (_tenant_id, 'engineer', 'view_my_jobs', true),
    (_tenant_id, 'engineer', 'update_assigned_jobs', true),
    (_tenant_id, 'engineer', 'add_job_comments', true),
    (_tenant_id, 'engineer', 'upload_attachments', true),
    (_tenant_id, 'engineer', 'mark_waiting_customer', true),
    (_tenant_id, 'engineer', 'mark_waiting_vendor', true),
    (_tenant_id, 'engineer', 'complete_assigned_job', true),
    (_tenant_id, 'engineer', 'view_calendar', true),
    (_tenant_id, 'engineer', 'view_reports', true),
    (_tenant_id, 'engineer', 'print_reports', true),
    (_tenant_id, 'engineer', 'export_reports_excel', true),
    -- Engineer (recommended OFF)
    (_tenant_id, 'engineer', 'view_all_jobs', false),
    (_tenant_id, 'engineer', 'reassign_engineer', false),
    (_tenant_id, 'engineer', 'cancel_job', false),
    (_tenant_id, 'engineer', 'job_approval', false),
    (_tenant_id, 'engineer', 'settings', false),
    (_tenant_id, 'engineer', 'n3_writeback', false),
    (_tenant_id, 'engineer', 'pricing', false)
  ON CONFLICT (tenant_id, profile_code, permission_code) DO NOTHING;

  -- Report access defaults
  INSERT INTO public.report_access_rules
    (tenant_id, report_code, report_name, visible_to_support, visible_to_engineer,
     allow_print_support, allow_print_engineer, allow_excel_support, allow_excel_engineer, display_order)
  VALUES
    (_tenant_id, 'customer_job_history',   'Customer Job History',   true,  false, true,  false, true,  false, 10),
    (_tenant_id, 'job_summary',            'Job Summary',            true,  false, true,  false, true,  false, 20),
    (_tenant_id, 'waiting_customer',       'Waiting Customer',       true,  true,  true,  true,  true,  true,  30),
    (_tenant_id, 'waiting_vendor',         'Waiting Vendor',         true,  true,  true,  true,  true,  true,  40),
    (_tenant_id, 'vendor_ticket_summary',  'Vendor Ticket Summary',  true,  true,  true,  true,  true,  true,  50),
    (_tenant_id, 'renewal_due_soon',       'Renewal Due Soon',       true,  false, true,  false, true,  false, 60),
    (_tenant_id, 'overdue_customers',      'Overdue Customers',      true,  false, true,  false, true,  false, 70),
    (_tenant_id, 'engineer_job_summary',   'Engineer Job Summary',   true,  true,  true,  true,  true,  true,  80),
    (_tenant_id, 'engineer_performance',   'Engineer Performance',   false, false, false, false, false, false, 90),
    (_tenant_id, 'response_time',          'Response Time',          true,  false, true,  false, true,  false, 100),
    (_tenant_id, 'completion_time',        'Completion Time',        true,  false, true,  false, true,  false, 110),
    (_tenant_id, 'activity_log',           'Activity Log',           false, false, false, false, false, false, 120),
    (_tenant_id, 'n3_sync_report',         'N3 Sync Report',         false, false, false, false, false, false, 130)
  ON CONFLICT (tenant_id, report_code) DO NOTHING;
END;
$$;

-- Trigger: seed defaults for every new tenant
CREATE OR REPLACE FUNCTION public.tg_tenants_seed_access_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_tenant_access_defaults(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_seed_access_defaults ON public.tenants;
CREATE TRIGGER trg_tenants_seed_access_defaults
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_tenants_seed_access_defaults();

-- Backfill for existing tenants
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_tenant_access_defaults(t.id);
  END LOOP;
END $$;
