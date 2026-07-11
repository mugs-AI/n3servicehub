
-- Milestone 1.5 — Jobs Workspace schema additions

ALTER TABLE public.general_settings
  ADD COLUMN IF NOT EXISTS assigned_user_label text NOT NULL DEFAULT 'Engineer',
  ADD COLUMN IF NOT EXISTS job_assignment_mode text NOT NULL DEFAULT 'auto_assign_creator';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='general_settings_job_assignment_mode_check') THEN
    ALTER TABLE public.general_settings
      ADD CONSTRAINT general_settings_job_assignment_mode_check
      CHECK (job_assignment_mode IN ('auto_assign_creator','leave_unassigned','select_each_time'));
  END IF;
END $$;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS started_by uuid REFERENCES public.users_local(id),
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.users_local(id),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_note text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.users_local(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES public.users_local(id),
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS waiting_customer_reason text,
  ADD COLUMN IF NOT EXISTS waiting_customer_since timestamptz,
  ADD COLUMN IF NOT EXISTS waiting_customer_follow_up_date date,
  ADD COLUMN IF NOT EXISTS waiting_customer_marked_by uuid REFERENCES public.users_local(id),
  ADD COLUMN IF NOT EXISTS waiting_customer_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_remark text,
  ADD COLUMN IF NOT EXISTS vendor_marked_by uuid REFERENCES public.users_local(id),
  ADD COLUMN IF NOT EXISTS vendor_marked_at timestamptz;

CREATE INDEX IF NOT EXISTS jobs_tenant_status_idx ON public.jobs (tenant_id, status);
CREATE INDEX IF NOT EXISTS jobs_tenant_assigned_idx ON public.jobs (tenant_id, assigned_to);
CREATE INDEX IF NOT EXISTS jobs_tenant_n3_assigned_idx ON public.jobs (tenant_id, assigned_n3_user_id);
CREATE INDEX IF NOT EXISTS jobs_vendor_ticket_idx ON public.jobs (tenant_id, vendor_ticket_number);

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'job_reassigned';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'job_approved';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'job_rejected';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'approval_requested';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'waiting_customer_followup';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'waiting_vendor_followup';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'high_priority_assigned';
