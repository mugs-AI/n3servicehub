
-- Lock down SECURITY DEFINER helpers exposed by the migration above.

-- Tenant membership helpers: used by RLS policies -> callable by authenticated only.
REVOKE ALL ON FUNCTION public.is_tenant_member(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_tenant_role(UUID, public.user_local_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_tenant_role(UUID, public.user_local_role[]) TO authenticated, service_role;

-- Job number generator: only invoked via BEFORE INSERT trigger, never directly.
REVOKE ALL ON FUNCTION public.tg_jobs_assign_job_no() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_jobs_assign_job_no() TO service_role;

-- Shared updated_at trigger: only invoked via triggers.
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_set_updated_at() TO service_role;

-- Immutable job_no guard: trigger-only.
REVOKE ALL ON FUNCTION public.tg_jobs_freeze_job_no() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_jobs_freeze_job_no() TO service_role;
