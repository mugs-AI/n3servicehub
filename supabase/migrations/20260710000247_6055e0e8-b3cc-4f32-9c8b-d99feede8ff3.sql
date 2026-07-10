
-- renewal_stock_mapping
CREATE TABLE public.renewal_stock_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stock_code TEXT NOT NULL,
  description TEXT,
  contract_days INTEGER NOT NULL CHECK (contract_days > 0),
  service_type TEXT NOT NULL DEFAULT 'contract',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, stock_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.renewal_stock_mapping TO authenticated;
GRANT ALL ON public.renewal_stock_mapping TO service_role;
ALTER TABLE public.renewal_stock_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "renewal_stock_mapping_select" ON public.renewal_stock_mapping
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "renewal_stock_mapping_write" ON public.renewal_stock_mapping
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]))
  WITH CHECK (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]));
CREATE TRIGGER trg_renewal_stock_mapping_updated_at
  BEFORE UPDATE ON public.renewal_stock_mapping
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- adhoc_stock_mapping
CREATE TABLE public.adhoc_stock_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stock_code TEXT NOT NULL,
  description TEXT,
  service_type TEXT NOT NULL DEFAULT 'ad_hoc',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, stock_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adhoc_stock_mapping TO authenticated;
GRANT ALL ON public.adhoc_stock_mapping TO service_role;
ALTER TABLE public.adhoc_stock_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adhoc_stock_mapping_select" ON public.adhoc_stock_mapping
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "adhoc_stock_mapping_write" ON public.adhoc_stock_mapping
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]))
  WITH CHECK (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]));
CREATE TRIGGER trg_adhoc_stock_mapping_updated_at
  BEFORE UPDATE ON public.adhoc_stock_mapping
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- general_settings (one row per tenant)
CREATE TABLE public.general_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  due_soon_days INTEGER NOT NULL DEFAULT 45 CHECK (due_soon_days IN (30,45,60,90)),
  job_prefix TEXT NOT NULL DEFAULT 'JB' CHECK (job_prefix ~ '^[A-Z0-9]{1,6}$'),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  notification_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.general_settings TO authenticated;
GRANT ALL ON public.general_settings TO service_role;
ALTER TABLE public.general_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "general_settings_select" ON public.general_settings
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "general_settings_write" ON public.general_settings
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]))
  WITH CHECK (public.has_tenant_role(tenant_id, VARIADIC ARRAY['owner','admin']::user_local_role[]));
CREATE TRIGGER trg_general_settings_updated_at
  BEFORE UPDATE ON public.general_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto-seed general_settings row for every new tenant
CREATE OR REPLACE FUNCTION public.tg_tenants_seed_general_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.general_settings (tenant_id)
  VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_tenants_seed_general_settings
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_tenants_seed_general_settings();

-- Backfill for existing tenants
INSERT INTO public.general_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- Update job-number assign trigger to use configurable prefix
CREATE OR REPLACE FUNCTION public.tg_jobs_assign_job_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today   DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_next    INTEGER;
  v_prefix  TEXT;
  v_seq_txt TEXT;
  v_cfg     TEXT;
BEGIN
  IF NEW.job_no IS NOT NULL AND length(NEW.job_no) > 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.job_number_sequences (tenant_id, seq_date, last_value)
    VALUES (NEW.tenant_id, v_today, 1)
  ON CONFLICT (tenant_id, seq_date) DO UPDATE
    SET last_value = public.job_number_sequences.last_value + 1
  RETURNING last_value INTO v_next;

  SELECT job_prefix INTO v_cfg FROM public.general_settings WHERE tenant_id = NEW.tenant_id;
  v_prefix  := COALESCE(v_cfg, 'JB') || to_char(v_today, 'YYMMDD');
  v_seq_txt := lpad(v_next::TEXT, 2, '0');
  NEW.job_no := v_prefix || v_seq_txt;
  RETURN NEW;
END;
$$;
