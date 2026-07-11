/**
 * Milestone 1.3 — Customer Contract Status Engine server functions.
 * Admin/owner only. Reads and (re)computes `customer_contract_snapshots`.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ContractStatus } from "@/lib/contract-status/ContractStatusEngine.server";

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

export type ContractStatusSummary = {
  totalCustomers: number;
  snapshotCount: number;
  counts: Record<ContractStatus, number>;
  staleCount: number;
  failedCount: number;
  lastCalculatedAt: string | null;
  configError: string | null;
};

export type ParsingDiagnosticRow = {
  source: "sales_invoice" | "delivery_order";
  docId: string;
  docNo: string | null;
  docDate: string | null;
  customerCode: string | null;
  reason: string;
  lineCount: number;
  missingStockCount: number;
};

export const getContractStatusSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => i)
  .handler(async ({ data, context }): Promise<ContractStatusSummary> => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);

    const [{ count: totalCustomers }, { data: snaps }, { data: gs }] = await Promise.all([
      context.supabase
        .from("servicehub_customers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", data.tenantId),
      context.supabase
        .from("customer_contract_snapshots")
        .select("contract_status, is_stale, calculation_error, last_calculated_at")
        .eq("tenant_id", data.tenantId),
      context.supabase
        .from("general_settings")
        .select("due_soon_days")
        .eq("tenant_id", data.tenantId)
        .maybeSingle(),
    ]);
    const counts: Record<ContractStatus, number> = {
      active: 0,
      due_soon: 0,
      overdue: 0,
      unknown: 0,
      suspended: 0,
    };
    let stale = 0;
    let failed = 0;
    let last: string | null = null;
    for (const s of snaps ?? []) {
      const st = s.contract_status as ContractStatus;
      if (st in counts) counts[st] += 1;
      if (s.is_stale) stale += 1;
      if (s.calculation_error) failed += 1;
      if (s.last_calculated_at && (!last || s.last_calculated_at > last)) {
        last = s.last_calculated_at;
      }
    }
    let configError: string | null = null;
    if (!gs) {
      configError = "General Settings row missing for this tenant.";
    } else if (typeof gs.due_soon_days !== "number" || gs.due_soon_days <= 0) {
      configError = "General Settings 'due_soon_days' is not configured.";
    }
    return {
      totalCustomers: totalCustomers ?? 0,
      snapshotCount: (snaps ?? []).length,
      counts,
      staleCount: stale,
      failedCount: failed,
      lastCalculatedAt: last,
      configError,
    };
  });

export type ContractSnapshotRow = {
  customerCode: string;
  customerName: string | null;
  source: string | null;
  documentNo: string | null;
  documentDate: string | null;
  stockCode: string | null;
  contractDays: number | null;
  expiryDate: string | null;
  remainingDays: number | null;
  status: ContractStatus;
  lastCalculatedAt: string | null;
  isStale: boolean;
  error: string | null;
};

export const listContractSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { tenantId: string; status?: ContractStatus; search?: string; limit?: number }) => i,
  )
  .handler(async ({ data, context }): Promise<ContractSnapshotRow[]> => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    let q = context.supabase
      .from("customer_contract_snapshots")
      .select(
        "n3_customer_code, n3_customer_name, latest_contract_source, latest_contract_document_no, latest_contract_date, latest_contract_stock_code, contract_days, expiry_date, remaining_days, contract_status, last_calculated_at, is_stale, calculation_error",
      )
      .eq("tenant_id", data.tenantId)
      .order("remaining_days", { ascending: true, nullsFirst: false })
      .limit(Math.min(data.limit ?? 500, 1000));
    if (data.status) q = q.eq("contract_status", data.status);
    if (data.search && data.search.trim().length > 0) {
      const s = `%${data.search.trim()}%`;
      q = q.or(`n3_customer_code.ilike.${s},n3_customer_name.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      customerCode: r.n3_customer_code,
      customerName: r.n3_customer_name,
      source: r.latest_contract_source,
      documentNo: r.latest_contract_document_no,
      documentDate: r.latest_contract_date,
      stockCode: r.latest_contract_stock_code,
      contractDays: r.contract_days,
      expiryDate: r.expiry_date,
      remainingDays: r.remaining_days,
      status: r.contract_status as ContractStatus,
      lastCalculatedAt: r.last_calculated_at,
      isStale: r.is_stale,
      error: r.calculation_error,
    }));
  });

export const recalculateContractStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => i)
  .handler(async ({ data, context }) => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ContractStatusEngine } = await import(
      "@/lib/contract-status/ContractStatusEngine.server"
    );
    const engine = new ContractStatusEngine(supabaseAdmin);
    const result = await engine.recalculateTenant(data.tenantId);
    return result;
  });
