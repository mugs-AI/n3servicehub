/**
 * Server functions for Milestone 1.2.8 — Approval Rules,
 * Access Profiles, and Report Access. Owner/admin only.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertTenantAdmin(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("users_local")
    .select("role, is_active")
    .eq("auth_user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data || !["owner", "admin"].includes(data.role)) {
    throw new Error("Forbidden: tenant admin role required");
  }
}

// ---------------- Approval Rules ----------------

export type CustomerStatus = "active" | "due_soon" | "overdue" | "suspended" | "unknown";
export type InitialJobStatus = "draft" | "pending";

export type ApprovalRuleRow = {
  id: string;
  customerStatus: CustomerStatus;
  canCreateJob: boolean;
  initialJobStatus: InitialJobStatus;
  approvalRequired: boolean;
  isActive: boolean;
};

export const listApprovalRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => i)
  .handler(async ({ data, context }): Promise<ApprovalRuleRow[]> => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const { data: rows, error } = await context.supabase
      .from("approval_rules")
      .select("id, customer_status, can_create_job, initial_job_status, approval_required, is_active")
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    const order: Record<CustomerStatus, number> = {
      active: 1, due_soon: 2, overdue: 3, suspended: 4, unknown: 5,
    };
    return (rows ?? [])
      .map((r) => ({
        id: r.id,
        customerStatus: r.customer_status as CustomerStatus,
        canCreateJob: r.can_create_job,
        initialJobStatus: r.initial_job_status as InitialJobStatus,
        approvalRequired: r.approval_required,
        isActive: r.is_active,
      }))
      .sort((a, b) => order[a.customerStatus] - order[b.customerStatus]);
  });

export const updateApprovalRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      tenantId: string;
      id: string;
      initialJobStatus?: InitialJobStatus;
      approvalRequired?: boolean;
      isActive?: boolean;
    }) => i,
  )
  .handler(async ({ data, context }) => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const patch: Record<string, unknown> = {};
    if (data.initialJobStatus !== undefined) patch.initial_job_status = data.initialJobStatus;
    if (data.approvalRequired !== undefined) patch.approval_required = data.approvalRequired;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    const { error } = await context.supabase
      .from("approval_rules")
      .update(patch)
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });

// ---------------- Access Profile Permissions ----------------

export type ProfileCode = "support" | "engineer";

export type PermissionRow = {
  id: string;
  profileCode: ProfileCode;
  permissionCode: string;
  isAllowed: boolean;
};

export const listAccessPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => i)
  .handler(async ({ data, context }): Promise<PermissionRow[]> => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const { data: rows, error } = await context.supabase
      .from("access_profile_permissions")
      .select("id, profile_code, permission_code, is_allowed")
      .eq("tenant_id", data.tenantId)
      .in("profile_code", ["support", "engineer"]);
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      profileCode: r.profile_code as ProfileCode,
      permissionCode: r.permission_code,
      isAllowed: r.is_allowed,
    }));
  });

export const updateAccessPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; id: string; isAllowed: boolean }) => i)
  .handler(async ({ data, context }) => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const { error } = await context.supabase
      .from("access_profile_permissions")
      .update({ is_allowed: data.isAllowed })
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });

// ---------------- Report Access ----------------

export type ReportAccessRow = {
  id: string;
  reportCode: string;
  reportName: string;
  visibleToSupport: boolean;
  visibleToEngineer: boolean;
  allowPrintSupport: boolean;
  allowPrintEngineer: boolean;
  allowExcelSupport: boolean;
  allowExcelEngineer: boolean;
  isActive: boolean;
  displayOrder: number;
};

export const listReportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => i)
  .handler(async ({ data, context }): Promise<ReportAccessRow[]> => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const { data: rows, error } = await context.supabase
      .from("report_access_rules")
      .select(
        "id, report_code, report_name, visible_to_support, visible_to_engineer, allow_print_support, allow_print_engineer, allow_excel_support, allow_excel_engineer, is_active, display_order",
      )
      .eq("tenant_id", data.tenantId)
      .order("display_order");
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      reportCode: r.report_code,
      reportName: r.report_name,
      visibleToSupport: r.visible_to_support,
      visibleToEngineer: r.visible_to_engineer,
      allowPrintSupport: r.allow_print_support,
      allowPrintEngineer: r.allow_print_engineer,
      allowExcelSupport: r.allow_excel_support,
      allowExcelEngineer: r.allow_excel_engineer,
      isActive: r.is_active,
      displayOrder: r.display_order,
    }));
  });

export type ReportAccessField =
  | "visible_to_support"
  | "visible_to_engineer"
  | "allow_print_support"
  | "allow_print_engineer"
  | "allow_excel_support"
  | "allow_excel_engineer"
  | "is_active";

export const updateReportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { tenantId: string; id: string; field: ReportAccessField; value: boolean }) => i,
  )
  .handler(async ({ data, context }) => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const allowed: ReportAccessField[] = [
      "visible_to_support",
      "visible_to_engineer",
      "allow_print_support",
      "allow_print_engineer",
      "allow_excel_support",
      "allow_excel_engineer",
      "is_active",
    ];
    if (!allowed.includes(data.field)) throw new Error("Invalid field");
    const { error } = await context.supabase
      .from("report_access_rules")
      .update({ [data.field]: data.value })
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });
