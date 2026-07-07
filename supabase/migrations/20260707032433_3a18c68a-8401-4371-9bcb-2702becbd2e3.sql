
-- =====================================================================
-- Milestone 1.2 — N3 Master Data Synchronization Layer
-- =====================================================================

-- ---------- sync_entity enum ----------
DO $$ BEGIN
  CREATE TYPE public.sync_entity AS ENUM (
    'customers','stock','users','roles','sales_invoices','delivery_orders','company_profile'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sync_status AS ENUM ('pending','running','success','failed','partial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- helper: common sync columns applied by trigger ----------

-- =====================================================================
-- servicehub_customers
-- =====================================================================
CREATE TABLE public.servicehub_customers (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  n3_record_id   TEXT NOT NULL,
  n3_code        TEXT,
  name           TEXT,
  email          TEXT,
  phone          TEXT,
  currency_code  TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_status    public.sync_status NOT NULL DEFAULT 'success',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT servicehub_customers_tenant_record_unique UNIQUE (tenant_id, n3_record_id)
);
CREATE INDEX servicehub_customers_tenant_idx ON public.servicehub_customers(tenant_id);
CREATE INDEX servicehub_customers_tenant_code_idx ON public.servicehub_customers(tenant_id, n3_code);

GRANT SELECT ON public.servicehub_customers TO authenticated;
GRANT ALL ON public.servicehub_customers TO service_role;
ALTER TABLE public.servicehub_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sh_customers_select_tenant" ON public.servicehub_customers
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TRIGGER tg_sh_customers_updated_at BEFORE UPDATE ON public.servicehub_customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- servicehub_stock
-- =====================================================================
CREATE TABLE public.servicehub_stock (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  n3_record_id   TEXT NOT NULL,
  n3_code        TEXT,
  description    TEXT,
  uom            TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_status    public.sync_status NOT NULL DEFAULT 'success',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT servicehub_stock_tenant_record_unique UNIQUE (tenant_id, n3_record_id)
);
CREATE INDEX servicehub_stock_tenant_idx ON public.servicehub_stock(tenant_id);
CREATE INDEX servicehub_stock_tenant_code_idx ON public.servicehub_stock(tenant_id, n3_code);

GRANT SELECT ON public.servicehub_stock TO authenticated;
GRANT ALL ON public.servicehub_stock TO service_role;
ALTER TABLE public.servicehub_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sh_stock_select_tenant" ON public.servicehub_stock
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TRIGGER tg_sh_stock_updated_at BEFORE UPDATE ON public.servicehub_stock
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- servicehub_users (N3 users of the connected company)
-- =====================================================================
CREATE TABLE public.servicehub_users (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  n3_record_id   TEXT NOT NULL,
  email          TEXT,
  name           TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_status    public.sync_status NOT NULL DEFAULT 'success',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT servicehub_users_tenant_record_unique UNIQUE (tenant_id, n3_record_id)
);
CREATE INDEX servicehub_users_tenant_idx ON public.servicehub_users(tenant_id);

GRANT SELECT ON public.servicehub_users TO authenticated;
GRANT ALL ON public.servicehub_users TO service_role;
ALTER TABLE public.servicehub_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sh_users_select_tenant" ON public.servicehub_users
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TRIGGER tg_sh_users_updated_at BEFORE UPDATE ON public.servicehub_users
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- servicehub_roles (derived from N3 user role attachments)
-- =====================================================================
CREATE TABLE public.servicehub_roles (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  n3_record_id   TEXT NOT NULL,
  name           TEXT,
  source         TEXT,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_status    public.sync_status NOT NULL DEFAULT 'success',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT servicehub_roles_tenant_record_unique UNIQUE (tenant_id, n3_record_id)
);
CREATE INDEX servicehub_roles_tenant_idx ON public.servicehub_roles(tenant_id);

GRANT SELECT ON public.servicehub_roles TO authenticated;
GRANT ALL ON public.servicehub_roles TO service_role;
ALTER TABLE public.servicehub_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sh_roles_select_tenant" ON public.servicehub_roles
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TRIGGER tg_sh_roles_updated_at BEFORE UPDATE ON public.servicehub_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- servicehub_sales_invoices (incremental)
-- =====================================================================
CREATE TABLE public.servicehub_sales_invoices (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  n3_record_id      TEXT NOT NULL,
  doc_no            TEXT,
  n3_customer_code  TEXT,
  n3_customer_name  TEXT,
  doc_date          DATE,
  total_amount      NUMERIC(18,4),
  currency_code     TEXT,
  is_cancelled      BOOLEAN NOT NULL DEFAULT FALSE,
  n3_last_modified  TIMESTAMPTZ,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_status       public.sync_status NOT NULL DEFAULT 'success',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT servicehub_sales_invoices_tenant_record_unique UNIQUE (tenant_id, n3_record_id)
);
CREATE INDEX servicehub_sales_invoices_tenant_idx ON public.servicehub_sales_invoices(tenant_id);
CREATE INDEX servicehub_sales_invoices_tenant_docdate_idx ON public.servicehub_sales_invoices(tenant_id, doc_date DESC);
CREATE INDEX servicehub_sales_invoices_tenant_customer_idx ON public.servicehub_sales_invoices(tenant_id, n3_customer_code);

GRANT SELECT ON public.servicehub_sales_invoices TO authenticated;
GRANT ALL ON public.servicehub_sales_invoices TO service_role;
ALTER TABLE public.servicehub_sales_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sh_sales_invoices_select_tenant" ON public.servicehub_sales_invoices
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TRIGGER tg_sh_sales_invoices_updated_at BEFORE UPDATE ON public.servicehub_sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- servicehub_delivery_orders (incremental)
-- =====================================================================
CREATE TABLE public.servicehub_delivery_orders (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  n3_record_id      TEXT NOT NULL,
  doc_no            TEXT,
  n3_customer_code  TEXT,
  n3_customer_name  TEXT,
  doc_date          DATE,
  is_cancelled      BOOLEAN NOT NULL DEFAULT FALSE,
  n3_last_modified  TIMESTAMPTZ,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_status       public.sync_status NOT NULL DEFAULT 'success',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT servicehub_delivery_orders_tenant_record_unique UNIQUE (tenant_id, n3_record_id)
);
CREATE INDEX servicehub_delivery_orders_tenant_idx ON public.servicehub_delivery_orders(tenant_id);
CREATE INDEX servicehub_delivery_orders_tenant_docdate_idx ON public.servicehub_delivery_orders(tenant_id, doc_date DESC);
CREATE INDEX servicehub_delivery_orders_tenant_customer_idx ON public.servicehub_delivery_orders(tenant_id, n3_customer_code);

GRANT SELECT ON public.servicehub_delivery_orders TO authenticated;
GRANT ALL ON public.servicehub_delivery_orders TO service_role;
ALTER TABLE public.servicehub_delivery_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sh_delivery_orders_select_tenant" ON public.servicehub_delivery_orders
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE TRIGGER tg_sh_delivery_orders_updated_at BEFORE UPDATE ON public.servicehub_delivery_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- sync_runs — audit log for every sync attempt
-- =====================================================================
CREATE TABLE public.sync_runs (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity            public.sync_entity NOT NULL,
  status            public.sync_status NOT NULL DEFAULT 'running',
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  duration_ms       INTEGER,
  inserted_count    INTEGER NOT NULL DEFAULT 0,
  updated_count     INTEGER NOT NULL DEFAULT 0,
  processed_count   INTEGER NOT NULL DEFAULT 0,
  error_message     TEXT,
  triggered_by      TEXT NOT NULL DEFAULT 'scheduler',
  watermark_used    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sync_runs_tenant_entity_started_idx
  ON public.sync_runs(tenant_id, entity, started_at DESC);

GRANT SELECT ON public.sync_runs TO authenticated;
GRANT ALL ON public.sync_runs TO service_role;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_runs_select_tenant" ON public.sync_runs
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- =====================================================================
-- sync_schedules — configurable per-tenant per-entity intervals + watermark
-- =====================================================================
CREATE TABLE public.sync_schedules (
  id                    UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity                public.sync_entity NOT NULL,
  interval_minutes      INTEGER NOT NULL,
  is_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  last_successful_at    TIMESTAMPTZ,
  last_watermark        TIMESTAMPTZ,
  next_due_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sync_schedules_tenant_entity_unique UNIQUE (tenant_id, entity),
  CONSTRAINT sync_schedules_interval_positive CHECK (interval_minutes > 0)
);
CREATE INDEX sync_schedules_due_idx ON public.sync_schedules(next_due_at) WHERE is_enabled = TRUE;

GRANT SELECT ON public.sync_schedules TO authenticated;
GRANT ALL ON public.sync_schedules TO service_role;
ALTER TABLE public.sync_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_schedules_select_tenant" ON public.sync_schedules
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE POLICY "sync_schedules_admin_update" ON public.sync_schedules
  FOR UPDATE TO authenticated
    USING (public.has_tenant_role(tenant_id, 'owner'::user_local_role, 'admin'::user_local_role))
    WITH CHECK (public.has_tenant_role(tenant_id, 'owner'::user_local_role, 'admin'::user_local_role));

CREATE TRIGGER tg_sync_schedules_updated_at BEFORE UPDATE ON public.sync_schedules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- Auto-seed sync_schedules when a tenant is created
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_tenants_seed_sync_schedules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.sync_schedules (tenant_id, entity, interval_minutes) VALUES
    (NEW.id, 'customers',        60),
    (NEW.id, 'stock',            60),
    (NEW.id, 'users',            60),
    (NEW.id, 'roles',            60),
    (NEW.id, 'sales_invoices',   20),
    (NEW.id, 'delivery_orders',  20),
    (NEW.id, 'company_profile', 1440)
  ON CONFLICT (tenant_id, entity) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_tenants_seed_sync_schedules() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.tg_tenants_seed_sync_schedules() TO service_role;

DROP TRIGGER IF EXISTS tg_tenants_seed_sync_schedules ON public.tenants;
CREATE TRIGGER tg_tenants_seed_sync_schedules
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_tenants_seed_sync_schedules();

-- Backfill schedules for any tenants already present.
INSERT INTO public.sync_schedules (tenant_id, entity, interval_minutes)
SELECT t.id, e.entity, e.mins
FROM public.tenants t
CROSS JOIN (VALUES
  ('customers'::public.sync_entity,       60),
  ('stock'::public.sync_entity,           60),
  ('users'::public.sync_entity,           60),
  ('roles'::public.sync_entity,           60),
  ('sales_invoices'::public.sync_entity,  20),
  ('delivery_orders'::public.sync_entity, 20),
  ('company_profile'::public.sync_entity, 1440)
) AS e(entity, mins)
ON CONFLICT (tenant_id, entity) DO NOTHING;

-- =====================================================================
-- Tighten helper trigger exec grants (accepted-finding pattern)
-- =====================================================================
REVOKE ALL ON FUNCTION public.tg_tenants_seed_sync_schedules() FROM PUBLIC;
