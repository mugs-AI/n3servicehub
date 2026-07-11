/**
 * Milestone 1.4 — Customer Service Console server functions.
 * All operations are strictly tenant-scoped and permission-checked server-side.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UserRole = "owner" | "admin" | "manager" | "technician" | "viewer";
export type EffectiveProfile = "administrator" | "support" | "engineer" | "viewer";

/** Map users_local.role → access profile used by permissions/approval rules. */
export function effectiveProfile(role: UserRole): EffectiveProfile {
  if (role === "owner" || role === "admin") return "administrator";
  if (role === "manager") return "support";
  if (role === "technician") return "engineer";
  return "viewer";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadMembership(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("users_local")
    .select("id, role, display_name, email, is_active")
    .eq("auth_user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
  return data as {
    id: string;
    role: UserRole;
    display_name: string | null;
    email: string;
    is_active: boolean;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hasPermission(supabase: any, tenantId: string, role: UserRole, permissionCode: string) {
  const profile = effectiveProfile(role);
  if (profile === "administrator") return true;
  if (profile === "viewer") return false;
  const { data, error } = await supabase
    .from("access_profile_permissions")
    .select("is_allowed")
    .eq("tenant_id", tenantId)
    .eq("profile_code", profile)
    .eq("permission_code", permissionCode)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.is_allowed);
}

// -------- Tenant context --------

export type MyTenant = {
  tenantId: string;
  tenantName: string;
  role: UserRole;
  profile: EffectiveProfile;
  displayName: string | null;
  email: string;
  usersLocalId: string;
};

export const getMyTenants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyTenant[]> => {
    const { data, error } = await context.supabase
      .from("users_local")
      .select("id, role, display_name, email, tenant_id, tenants(name)")
      .eq("auth_user_id", context.userId)
      .eq("is_active", true);
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((r) => ({
      tenantId: r.tenant_id,
      tenantName: r.tenants?.name ?? "",
      role: r.role,
      profile: effectiveProfile(r.role),
      displayName: r.display_name,
      email: r.email,
      usersLocalId: r.id,
    }));
  });

// -------- Support dashboard --------

export type SupportDashboardCounts = {
  todayJobs: number;
  highPriority: number;
  draftOrPending: number;
  waitingCustomer: number;
  waitingVendor: number;
  dueSoonCustomers: number;
  overdueCustomers: number;
};

export const getSupportDashboardCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => i)
  .handler(async ({ data, context }): Promise<SupportDashboardCounts> => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    const allowed = await hasPermission(
      context.supabase,
      data.tenantId,
      m.role,
      "view_support_dashboard",
    );
    if (!allowed) throw new Error("Forbidden: view_support_dashboard permission required");

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startISO = startOfDay.toISOString();

    const [today, high, draft, wc, wv, ds, od] = await Promise.all([
      context.supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId)
        .gte("created_at", startISO),
      context.supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId)
        .eq("priority", "high")
        .not("status", "in", "(completed,cancelled)"),
      context.supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId)
        .in("status", ["draft", "waiting_approval"]),
      context.supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId)
        .eq("status", "waiting_customer"),
      context.supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId)
        .eq("status", "waiting_vendor"),
      context.supabase
        .from("customer_contract_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId)
        .eq("contract_status", "due_soon"),
      context.supabase
        .from("customer_contract_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId)
        .eq("contract_status", "overdue"),
    ]);

    return {
      todayJobs: today.count ?? 0,
      highPriority: high.count ?? 0,
      draftOrPending: draft.count ?? 0,
      waitingCustomer: wc.count ?? 0,
      waitingVendor: wv.count ?? 0,
      dueSoonCustomers: ds.count ?? 0,
      overdueCustomers: od.count ?? 0,
    };
  });

// -------- Customer search --------

export type CustomerSearchResult = {
  n3RecordId: string;
  code: string | null;
  name: string | null;
  phone: string | null;
  contactPerson: string | null;
  email: string | null;
  contractStatus:
    | "active"
    | "due_soon"
    | "overdue"
    | "suspended"
    | "unknown";
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractContactPerson(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = ["contactPerson", "ContactPerson", "contact_person", "Contact", "attention"];
  for (const key of candidates) {
    const v = payload[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export const searchCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; query: string; limit?: number }) => i)
  .handler(async ({ data, context }): Promise<CustomerSearchResult[]> => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    if (
      !(await hasPermission(context.supabase, data.tenantId, m.role, "search_customers"))
    ) {
      throw new Error("Forbidden: search_customers permission required");
    }
    const q = data.query.trim();
    if (q.length < 2) return [];
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const limit = Math.min(data.limit ?? 25, 50);

    const { data: rows, error } = await context.supabase
      .from("servicehub_customers")
      .select("n3_record_id, n3_code, name, phone, email, payload")
      .eq("tenant_id", data.tenantId)
      .or(
        `n3_code.ilike.${like},name.ilike.${like},phone.ilike.${like},email.ilike.${like}`,
      )
      .limit(limit);
    if (error) throw error;

    const codes = Array.from(
      new Set(((rows ?? []) as Array<{ n3_code: string | null }>).map((r) => r.n3_code).filter(Boolean)),
    ) as string[];
    let snapMap = new Map<string, CustomerSearchResult["contractStatus"]>();
    if (codes.length > 0) {
      const { data: snaps } = await context.supabase
        .from("customer_contract_snapshots")
        .select("n3_customer_code, contract_status")
        .eq("tenant_id", data.tenantId)
        .in("n3_customer_code", codes);
      snapMap = new Map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (snaps ?? []).map((s: any) => [s.n3_customer_code, s.contract_status]),
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((r) => ({
      n3RecordId: r.n3_record_id,
      code: r.n3_code,
      name: r.name,
      phone: r.phone,
      contactPerson: extractContactPerson(r.payload),
      email: r.email,
      contractStatus:
        (r.n3_code && snapMap.get(r.n3_code)) ||
        ("unknown" as CustomerSearchResult["contractStatus"]),
    }));
  });

// -------- Customer summary --------

export type CustomerSummary = {
  code: string;
  name: string | null;
  phone: string | null;
  contactPerson: string | null;
  email: string | null;
  contractStatus: CustomerSearchResult["contractStatus"];
  latestContractSource: string | null;
  latestContractDocumentNo: string | null;
  latestContractDate: string | null;
  latestContractStockCode: string | null;
  contractStartDate: string | null;
  expiryDate: string | null;
  remainingDays: number | null;
  openJobCount: number;
  latestJobNo: string | null;
  latestJobDate: string | null;
  lastAssignedEngineer: string | null;
};

export const getCustomerSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; customerCode: string }) => i)
  .handler(async ({ data, context }): Promise<CustomerSummary> => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    if (
      !(await hasPermission(context.supabase, data.tenantId, m.role, "search_customers"))
    ) {
      throw new Error("Forbidden");
    }

    const [{ data: cust }, { data: snap }, jobsCount, latestJob] = await Promise.all([
      context.supabase
        .from("servicehub_customers")
        .select("n3_code, name, phone, email, payload")
        .eq("tenant_id", data.tenantId)
        .eq("n3_code", data.customerCode)
        .maybeSingle(),
      context.supabase
        .from("customer_contract_snapshots")
        .select(
          "contract_status, latest_contract_source, latest_contract_document_no, latest_contract_date, latest_contract_stock_code, expiry_date, remaining_days",
        )
        .eq("tenant_id", data.tenantId)
        .eq("n3_customer_code", data.customerCode)
        .maybeSingle(),
      context.supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId)
        .eq("n3_customer_code", data.customerCode)
        .not("status", "in", "(completed,cancelled)"),
      context.supabase
        .from("jobs")
        .select("job_no, created_at, assigned_engineer_display_name")
        .eq("tenant_id", data.tenantId)
        .eq("n3_customer_code", data.customerCode)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!cust) throw new Error("Customer not found in this tenant");

    return {
      code: cust.n3_code as string,
      name: cust.name,
      phone: cust.phone,
      contactPerson: extractContactPerson(cust.payload),
      email: cust.email,
      contractStatus:
        (snap?.contract_status as CustomerSearchResult["contractStatus"]) ?? "unknown",
      latestContractSource: snap?.latest_contract_source ?? null,
      latestContractDocumentNo: snap?.latest_contract_document_no ?? null,
      latestContractDate: snap?.latest_contract_date ?? null,
      latestContractStockCode: snap?.latest_contract_stock_code ?? null,
      contractStartDate: snap?.latest_contract_date ?? null,
      expiryDate: snap?.expiry_date ?? null,
      remainingDays: snap?.remaining_days ?? null,
      openJobCount: jobsCount.count ?? 0,
      latestJobNo: latestJob.data?.job_no ?? null,
      latestJobDate: latestJob.data?.created_at ?? null,
      lastAssignedEngineer: latestJob.data?.assigned_engineer_display_name ?? null,
    };
  });

// -------- Customer job history --------

export type CustomerJobHistoryRow = {
  jobNo: string;
  createdAt: string;
  subject: string;
  status: string;
  priority: string;
  assignedEngineer: string | null;
  createdBy: string | null;
};

export const listCustomerJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; customerCode: string; limit?: number }) => i)
  .handler(async ({ data, context }): Promise<CustomerJobHistoryRow[]> => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    if (
      !(await hasPermission(context.supabase, data.tenantId, m.role, "search_customers"))
    ) {
      throw new Error("Forbidden");
    }
    const { data: rows, error } = await context.supabase
      .from("jobs")
      .select(
        "job_no, created_at, title, status, priority, assigned_engineer_display_name, created_by_display_name",
      )
      .eq("tenant_id", data.tenantId)
      .eq("n3_customer_code", data.customerCode)
      .order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 10, 50));
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((r) => ({
      jobNo: r.job_no,
      createdAt: r.created_at,
      subject: r.title,
      status: r.status,
      priority: r.priority,
      assignedEngineer: r.assigned_engineer_display_name,
      createdBy: r.created_by_display_name,
    }));
  });

// -------- Engineer selector --------

export type EngineerOption = {
  /** Composite id: `n3:<record_id>` or `local:<users_local_id>` */
  id: string;
  displayName: string;
  source: "n3_user" | "local_user";
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractN3UserName(payload: any, fallback: string | null): string {
  if (fallback && fallback.trim()) return fallback.trim();
  if (payload && typeof payload === "object") {
    for (const key of ["displayName", "fullName", "name", "userName"]) {
      const v = payload[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "(unnamed)";
}

export const listEngineerOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => i)
  .handler(async ({ data, context }): Promise<EngineerOption[]> => {
    await loadMembership(context.supabase, context.userId, data.tenantId);
    const [n3, local] = await Promise.all([
      context.supabase
        .from("servicehub_users")
        .select("n3_record_id, name, payload")
        .eq("tenant_id", data.tenantId)
        .eq("is_active", true)
        .limit(500),
      context.supabase
        .from("users_local")
        .select("id, display_name, email")
        .eq("tenant_id", data.tenantId)
        .eq("is_active", true)
        .limit(500),
    ]);
    const out: EngineerOption[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of (n3.data ?? []) as any[]) {
      out.push({
        id: `n3:${u.n3_record_id}`,
        displayName: extractN3UserName(u.payload, u.name),
        source: "n3_user",
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of (local.data ?? []) as any[]) {
      out.push({
        id: `local:${u.id}`,
        displayName: u.display_name?.trim() || u.email,
        source: "local_user",
      });
    }
    out.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return out;
  });
