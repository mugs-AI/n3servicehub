
-- =========================================================================
-- ServiceHub for N3.QNE.Cloud — Milestone 1: Database Foundation
-- =========================================================================

-- ---- Enums ---------------------------------------------------------------
CREATE TYPE public.tenant_status       AS ENUM ('active', 'suspended', 'trial', 'cancelled');
CREATE TYPE public.user_local_role     AS ENUM ('owner', 'admin', 'manager', 'technician', 'viewer');
CREATE TYPE public.job_status          AS ENUM ('draft', 'open', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled', 'invoiced');
CREATE TYPE public.job_priority        AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE public.notification_type   AS ENUM ('job_assigned', 'job_updated', 'job_comment', 'renewal_due', 'system');
CREATE TYPE public.renewal_interval    AS ENUM ('weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom');

-- ---- Shared trigger: updated_at -----------------------------------------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================================
-- tenants
-- =========================================================================
CREATE TABLE public.tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  n3_tenant_code    TEXT,
  n3_company_name   TEXT,
  n3_api_key_ref    TEXT,   -- name of the secret holding the N3 PAT; never the key itself
  status            public.tenant_status NOT NULL DEFAULT 'trial',
  timezone          TEXT NOT NULL DEFAULT 'UTC',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every domain table has tenant_id. `tenants.id` IS its own tenant_id.
ALTER TABLE public.tenants ADD COLUMN tenant_id UUID
  GENERATED ALWAYS AS (id) STORED;

CREATE INDEX idx_tenants_status ON public.tenants(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;

CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- users_local (local mirror of Cloud auth users, scoped to a tenant)
-- =========================================================================
CREATE TABLE public.users_local (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_user_id      UUID NOT NULL,      -- references auth.users(id) logically (no FK per RLS best-practice)
  email             TEXT NOT NULL,
  display_name      TEXT,
  role              public.user_local_role NOT NULL DEFAULT 'technician',
  n3_user_id        TEXT,                -- QNE Users.Id (nullable until linked)
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, auth_user_id),
  UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_local_tenant       ON public.users_local(tenant_id);
CREATE INDEX idx_users_local_auth_user    ON public.users_local(auth_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.users_local TO authenticated;
GRANT ALL ON public.users_local TO service_role;

CREATE TRIGGER trg_users_local_updated_at BEFORE UPDATE ON public.users_local
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- SECURITY DEFINER helpers (avoid RLS recursion)
-- =========================================================================

-- Returns TRUE if the current auth user belongs to the given tenant.
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users_local ul
    WHERE ul.tenant_id    = _tenant_id
      AND ul.auth_user_id = auth.uid()
      AND ul.is_active    = TRUE
  );
$$;

-- Returns TRUE if the current auth user has any of the given roles in the tenant.
CREATE OR REPLACE FUNCTION public.has_tenant_role(_tenant_id UUID, VARIADIC _roles public.user_local_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users_local ul
    WHERE ul.tenant_id    = _tenant_id
      AND ul.auth_user_id = auth.uid()
      AND ul.is_active    = TRUE
      AND ul.role         = ANY(_roles)
  );
$$;

-- =========================================================================
-- tenants RLS
-- =========================================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_select_members ON public.tenants
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(id));

CREATE POLICY tenants_update_owners ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(id, 'owner', 'admin'))
  WITH CHECK (public.has_tenant_role(id, 'owner', 'admin'));

-- INSERT and DELETE on tenants are performed only by service_role
-- (tenant provisioning / off-boarding) and therefore have no policy for authenticated.

-- =========================================================================
-- users_local RLS
-- =========================================================================
ALTER TABLE public.users_local ENABLE ROW LEVEL SECURITY;

-- A user can always see their own row.
CREATE POLICY users_local_select_self ON public.users_local
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Owners / admins / managers can see everyone in their tenant.
CREATE POLICY users_local_select_tenant ON public.users_local
  FOR SELECT TO authenticated
  USING (public.has_tenant_role(tenant_id, 'owner', 'admin', 'manager'));

-- Owners / admins can insert / update / delete tenant members.
CREATE POLICY users_local_insert_admin ON public.users_local
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, 'owner', 'admin'));

CREATE POLICY users_local_update_admin ON public.users_local
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(tenant_id, 'owner', 'admin'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'owner', 'admin'));

CREATE POLICY users_local_delete_admin ON public.users_local
  FOR DELETE TO authenticated
  USING (public.has_tenant_role(tenant_id, 'owner', 'admin'));

-- A user may update their own display_name / last_login_at (row-level check only;
-- column-level restrictions belong in the service layer).
CREATE POLICY users_local_update_self ON public.users_local
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- =========================================================================
-- jobs — with tenant-scoped daily sequence for job_no
-- =========================================================================

-- Per-tenant / per-day counter table. Row created on demand by trigger.
CREATE TABLE public.job_number_sequences (
  tenant_id    UUID  NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  seq_date     DATE  NOT NULL,
  last_value   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, seq_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_number_sequences TO service_role;
-- No grants to authenticated: only the SECURITY DEFINER trigger reads/writes this.
ALTER TABLE public.job_number_sequences ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.jobs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_no             TEXT NOT NULL,       -- format JB{yy}{mm}{dd}{nn}
  title              TEXT NOT NULL,
  description        TEXT,
  status             public.job_status   NOT NULL DEFAULT 'draft',
  priority           public.job_priority NOT NULL DEFAULT 'normal',

  -- N3 references (IDs only — no local duplication of N3 master data)
  n3_customer_id     TEXT,
  n3_customer_code   TEXT,
  n3_customer_name   TEXT,   -- denormalized snapshot for display
  n3_stock_id        TEXT,
  n3_stock_code      TEXT,
  n3_delivery_order_id TEXT,
  n3_sales_invoice_id  TEXT,

  -- Scheduling
  scheduled_start    TIMESTAMPTZ,
  scheduled_end      TIMESTAMPTZ,
  actual_start       TIMESTAMPTZ,
  actual_end         TIMESTAMPTZ,
  due_date           DATE,

  -- Assignment
  assigned_to        UUID REFERENCES public.users_local(id) ON DELETE SET NULL,
  created_by         UUID REFERENCES public.users_local(id) ON DELETE SET NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, job_no)
);

CREATE INDEX idx_jobs_tenant             ON public.jobs(tenant_id);
CREATE INDEX idx_jobs_tenant_status      ON public.jobs(tenant_id, status);
CREATE INDEX idx_jobs_tenant_assigned    ON public.jobs(tenant_id, assigned_to);
CREATE INDEX idx_jobs_tenant_customer    ON public.jobs(tenant_id, n3_customer_id);
CREATE INDEX idx_jobs_tenant_due_date    ON public.jobs(tenant_id, due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;

CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Job number generator: JB{yy}{mm}{dd}{nn} where {nn} is the daily sequence
-- per tenant, zero-padded to at least 2 digits (grows to 3+ if a tenant exceeds 99/day).
CREATE OR REPLACE FUNCTION public.tg_jobs_assign_job_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today   DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_next    INTEGER;
  v_prefix  TEXT;
  v_seq_txt TEXT;
BEGIN
  IF NEW.job_no IS NOT NULL AND length(NEW.job_no) > 0 THEN
    RETURN NEW; -- explicit job_no (e.g. import) is preserved
  END IF;

  INSERT INTO public.job_number_sequences (tenant_id, seq_date, last_value)
    VALUES (NEW.tenant_id, v_today, 1)
  ON CONFLICT (tenant_id, seq_date) DO UPDATE
    SET last_value = public.job_number_sequences.last_value + 1
  RETURNING last_value INTO v_next;

  v_prefix  := 'JB' || to_char(v_today, 'YYMMDD');
  v_seq_txt := lpad(v_next::TEXT, 2, '0'); -- at least 2 digits; longer if > 99
  NEW.job_no := v_prefix || v_seq_txt;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jobs_assign_job_no
  BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_jobs_assign_job_no();

-- Guard: job_no is immutable once assigned.
CREATE OR REPLACE FUNCTION public.tg_jobs_freeze_job_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.job_no IS DISTINCT FROM OLD.job_no THEN
    RAISE EXCEPTION 'jobs.job_no is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jobs_freeze_job_no
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_jobs_freeze_job_no();

-- jobs RLS ---------------------------------------------------------------
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_select_tenant ON public.jobs
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY jobs_insert_tenant ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE POLICY jobs_update_tenant ON public.jobs
  FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE POLICY jobs_delete_admin ON public.jobs
  FOR DELETE TO authenticated
  USING (public.has_tenant_role(tenant_id, 'owner', 'admin', 'manager'));

-- =========================================================================
-- job_comments
-- =========================================================================
CREATE TABLE public.job_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id        UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  author_id     UUID REFERENCES public.users_local(id) ON DELETE SET NULL,
  body          TEXT NOT NULL,
  is_internal   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_comments_tenant     ON public.job_comments(tenant_id);
CREATE INDEX idx_job_comments_job        ON public.job_comments(job_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_comments TO authenticated;
GRANT ALL ON public.job_comments TO service_role;

CREATE TRIGGER trg_job_comments_updated_at BEFORE UPDATE ON public.job_comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.job_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_comments_select_tenant ON public.job_comments
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY job_comments_insert_tenant ON public.job_comments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));

-- Only the author (or a tenant admin) can edit or delete a comment.
CREATE POLICY job_comments_update_own ON public.job_comments
  FOR UPDATE TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND (
      author_id IN (SELECT id FROM public.users_local WHERE auth_user_id = auth.uid())
      OR public.has_tenant_role(tenant_id, 'owner', 'admin')
    )
  )
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE POLICY job_comments_delete_own ON public.job_comments
  FOR DELETE TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND (
      author_id IN (SELECT id FROM public.users_local WHERE auth_user_id = auth.uid())
      OR public.has_tenant_role(tenant_id, 'owner', 'admin')
    )
  );

-- =========================================================================
-- notifications
-- =========================================================================
CREATE TABLE public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recipient_id    UUID NOT NULL REFERENCES public.users_local(id) ON DELETE CASCADE,
  type            public.notification_type NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  entity_table    TEXT,        -- e.g. 'jobs'
  entity_id       UUID,        -- e.g. jobs.id
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient_unread
  ON public.notifications(recipient_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_tenant ON public.notifications(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Recipients see and mark-read their own notifications.
CREATE POLICY notifications_select_recipient ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_id IN (SELECT id FROM public.users_local WHERE auth_user_id = auth.uid())
  );

CREATE POLICY notifications_update_recipient ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    recipient_id IN (SELECT id FROM public.users_local WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    recipient_id IN (SELECT id FROM public.users_local WHERE auth_user_id = auth.uid())
  );

CREATE POLICY notifications_delete_recipient ON public.notifications
  FOR DELETE TO authenticated
  USING (
    recipient_id IN (SELECT id FROM public.users_local WHERE auth_user_id = auth.uid())
  );

-- Any tenant member may create notifications for tenant members
-- (system flows will run as service_role and bypass this policy).
CREATE POLICY notifications_insert_tenant ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));

-- =========================================================================
-- renewal_mapping
-- =========================================================================
CREATE TABLE public.renewal_mapping (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- N3 references (never duplicate the N3 master record locally)
  n3_customer_id     TEXT NOT NULL,
  n3_customer_code   TEXT,
  n3_stock_id        TEXT NOT NULL,
  n3_stock_code      TEXT,

  interval_type      public.renewal_interval NOT NULL DEFAULT 'annual',
  interval_days      INTEGER,     -- required when interval_type = 'custom'
  start_date         DATE NOT NULL,
  next_due_date      DATE NOT NULL,
  last_generated_at  TIMESTAMPTZ,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  notes              TEXT,

  created_by         UUID REFERENCES public.users_local(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, n3_customer_id, n3_stock_id),
  CONSTRAINT renewal_mapping_custom_requires_days
    CHECK (interval_type <> 'custom' OR interval_days IS NOT NULL)
);

CREATE INDEX idx_renewal_mapping_tenant_due
  ON public.renewal_mapping(tenant_id, next_due_date) WHERE is_active = TRUE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.renewal_mapping TO authenticated;
GRANT ALL ON public.renewal_mapping TO service_role;

CREATE TRIGGER trg_renewal_mapping_updated_at BEFORE UPDATE ON public.renewal_mapping
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.renewal_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY renewal_mapping_select_tenant ON public.renewal_mapping
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY renewal_mapping_insert_manager ON public.renewal_mapping
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, 'owner', 'admin', 'manager'));

CREATE POLICY renewal_mapping_update_manager ON public.renewal_mapping
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(tenant_id, 'owner', 'admin', 'manager'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'owner', 'admin', 'manager'));

CREATE POLICY renewal_mapping_delete_admin ON public.renewal_mapping
  FOR DELETE TO authenticated
  USING (public.has_tenant_role(tenant_id, 'owner', 'admin'));
