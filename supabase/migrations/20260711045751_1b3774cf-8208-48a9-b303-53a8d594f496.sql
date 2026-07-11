
ALTER TABLE public.customer_contract_snapshots DROP CONSTRAINT IF EXISTS ccs_status_check;
ALTER TABLE public.customer_contract_snapshots
  ADD CONSTRAINT ccs_status_check
  CHECK (contract_status = ANY (ARRAY['active','due_soon','overdue','unknown','suspended','pending_renewal_confirmation']));

ALTER TABLE public.customer_contract_snapshots
  ADD COLUMN IF NOT EXISTS calculation_error text,
  ADD COLUMN IF NOT EXISTS is_stale boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ccs_tenant_status_idx
  ON public.customer_contract_snapshots (tenant_id, contract_status);

-- Mark snapshots stale when renewal mapping or general settings change.
CREATE OR REPLACE FUNCTION public.tg_mark_contract_snapshots_stale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NOT NULL THEN
    UPDATE public.customer_contract_snapshots
       SET is_stale = true,
           last_calculated_at = NULL
     WHERE tenant_id = v_tenant;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_rsm_mark_snapshots_stale ON public.renewal_stock_mapping;
CREATE TRIGGER trg_rsm_mark_snapshots_stale
AFTER INSERT OR UPDATE OR DELETE ON public.renewal_stock_mapping
FOR EACH ROW EXECUTE FUNCTION public.tg_mark_contract_snapshots_stale();

DROP TRIGGER IF EXISTS trg_gs_mark_snapshots_stale ON public.general_settings;
CREATE TRIGGER trg_gs_mark_snapshots_stale
AFTER UPDATE OF due_soon_days ON public.general_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_mark_contract_snapshots_stale();
