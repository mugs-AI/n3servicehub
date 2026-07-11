/**
 * Customer Contract Status Engine (server-only).
 *
 * Single source of truth for contract status per Customer. Reads synced
 * ServiceHub tables + Renewal Mapping + General Settings and UPSERTs one
 * `customer_contract_snapshots` row per customer.
 *
 * Never called from the browser. Uses the admin (service-role) client
 * because it runs after sync completion and from admin server functions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ContractStatus =
  | "active"
  | "due_soon"
  | "overdue"
  | "unknown"
  | "suspended";

type DocSource = "sales_invoice" | "delivery_order";

type QualifyingDoc = {
  source: DocSource;
  docId: string | null;
  docNo: string | null;
  docDate: string; // yyyy-mm-dd
  stockCode: string;
  contractDays: number;
};

function extractLineStockCodes(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const candidates = [
    p.details,
    p.Details,
    p.lines,
    p.Lines,
    p.documentLines,
    p.DocumentLines,
    p.items,
    p.Items,
  ];
  const lines = candidates.find((c) => Array.isArray(c)) as unknown[] | undefined;
  if (!lines) return [];
  const out: string[] = [];
  for (const l of lines) {
    if (!l || typeof l !== "object") continue;
    const li = l as Record<string, unknown>;
    const code =
      (li.stockCode as string) ??
      (li.StockCode as string) ??
      (li.stock as string) ??
      (li.Stock as string) ??
      (li.itemCode as string) ??
      (li.ItemCode as string) ??
      (li.code as string) ??
      null;
    if (typeof code === "string" && code.trim().length > 0) out.push(code.trim());
  }
  return out;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00Z").getTime();
  const b = new Date(toIso + "T00:00:00Z").getTime();
  return Math.floor((b - a) / 86_400_000);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export type RecalcResult = {
  processed: number;
  written: number;
  failed: number;
  counts: Record<ContractStatus, number>;
};

export class ContractStatusEngine {
  constructor(private admin: SupabaseClient<Database>) {}

  /** Recalculate for every synced customer of the tenant. */
  async recalculateTenant(tenantId: string): Promise<RecalcResult> {
    const { data: customers, error } = await this.admin
      .from("servicehub_customers")
      .select("n3_record_id, n3_code, name")
      .eq("tenant_id", tenantId);
    if (error) throw error;
    const codes = (customers ?? [])
      .map((c) => c.n3_code)
      .filter((c): c is string => typeof c === "string" && c.length > 0);
    return this.recalculateForCustomers(tenantId, codes, customers ?? []);
  }

  /** Recalculate only the given customer codes (post-sync affected set). */
  async recalculateForCustomers(
    tenantId: string,
    customerCodes: string[],
    knownCustomers?: Array<{ n3_record_id: string; n3_code: string | null; name: string | null }>,
  ): Promise<RecalcResult> {
    const uniqueCodes = Array.from(new Set(customerCodes.filter((c) => c && c.length > 0)));
    const counts: Record<ContractStatus, number> = {
      active: 0,
      due_soon: 0,
      overdue: 0,
      unknown: 0,
      suspended: 0,
    };
    const result: RecalcResult = { processed: 0, written: 0, failed: 0, counts };
    if (uniqueCodes.length === 0) return result;

    // Load reference data once.
    const [{ data: mapping }, { data: gs }] = await Promise.all([
      this.admin
        .from("renewal_stock_mapping")
        .select("stock_code, contract_days, is_active")
        .eq("tenant_id", tenantId)
        .eq("is_active", true),
      this.admin
        .from("general_settings")
        .select("due_soon_days")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);
    const contractDaysByCode = new Map<string, number>();
    for (const m of mapping ?? []) {
      if (m.stock_code && typeof m.contract_days === "number") {
        contractDaysByCode.set(m.stock_code, m.contract_days);
      }
    }
    const dueSoonDays = gs?.due_soon_days ?? 30;

    // Load customer directory for name lookup if not provided.
    let directory = knownCustomers;
    if (!directory) {
      const { data } = await this.admin
        .from("servicehub_customers")
        .select("n3_record_id, n3_code, name")
        .eq("tenant_id", tenantId)
        .in("n3_code", uniqueCodes);
      directory = data ?? [];
    }
    const dirByCode = new Map(directory.map((d) => [d.n3_code ?? "", d]));

    // Fetch all qualifying docs for these customers in bulk.
    const [{ data: invoices }, { data: dos }] = await Promise.all([
      this.admin
        .from("servicehub_sales_invoices")
        .select("n3_record_id, doc_no, doc_date, n3_customer_code, is_cancelled, payload")
        .eq("tenant_id", tenantId)
        .in("n3_customer_code", uniqueCodes),
      this.admin
        .from("servicehub_delivery_orders")
        .select("n3_record_id, doc_no, doc_date, n3_customer_code, is_cancelled, payload")
        .eq("tenant_id", tenantId)
        .in("n3_customer_code", uniqueCodes),
    ]);

    const byCustomer = new Map<string, QualifyingDoc[]>();
    const collect = (
      source: DocSource,
      row: {
        n3_record_id: string;
        doc_no: string | null;
        doc_date: string | null;
        n3_customer_code: string | null;
        is_cancelled: boolean | null;
        payload: unknown;
      },
    ) => {
      if (row.is_cancelled) return;
      if (!row.doc_date || !row.n3_customer_code) return;
      const codes = extractLineStockCodes(row.payload);
      for (const stockCode of codes) {
        const days = contractDaysByCode.get(stockCode);
        if (!days) continue;
        const arr = byCustomer.get(row.n3_customer_code) ?? [];
        arr.push({
          source,
          docId: row.n3_record_id,
          docNo: row.doc_no,
          docDate: row.doc_date,
          stockCode,
          contractDays: days,
        });
        byCustomer.set(row.n3_customer_code, arr);
      }
    };
    for (const r of invoices ?? []) collect("sales_invoice", r);
    for (const r of dos ?? []) collect("delivery_order", r);

    const today = todayIso();
    const nowIso = new Date().toISOString();
    const upserts: Database["public"]["Tables"]["customer_contract_snapshots"]["Insert"][] = [];

    for (const code of uniqueCodes) {
      result.processed += 1;
      const dir = dirByCode.get(code);
      const qualifying = byCustomer.get(code) ?? [];
      let status: ContractStatus = "unknown";
      let latest: QualifyingDoc | null = null;
      let expiry: string | null = null;
      let remaining: number | null = null;

      if (qualifying.length > 0) {
        qualifying.sort((a, b) => (a.docDate < b.docDate ? 1 : a.docDate > b.docDate ? -1 : 0));
        latest = qualifying[0];
        expiry = addDays(latest.docDate, latest.contractDays);
        remaining = daysBetween(today, expiry);
        if (remaining < 0) status = "overdue";
        else if (remaining <= dueSoonDays) status = "due_soon";
        else status = "active";
      }

      counts[status] += 1;
      upserts.push({
        tenant_id: tenantId,
        n3_customer_id: dir?.n3_record_id ?? null,
        n3_customer_code: code,
        n3_customer_name: dir?.name ?? null,
        latest_contract_source: latest?.source ?? null,
        latest_contract_document_no: latest?.docNo ?? null,
        latest_contract_document_id: latest?.docId ?? null,
        latest_contract_date: latest?.docDate ?? null,
        latest_contract_stock_code: latest?.stockCode ?? null,
        contract_days: latest?.contractDays ?? null,
        expiry_date: expiry,
        remaining_days: remaining,
        contract_status: status,
        last_calculated_at: nowIso,
        calculation_error: null,
        is_stale: false,
      });
    }

    // Upsert in chunks.
    const chunkSize = 200;
    for (let i = 0; i < upserts.length; i += chunkSize) {
      const chunk = upserts.slice(i, i + chunkSize);
      const { error: upErr } = await this.admin
        .from("customer_contract_snapshots")
        .upsert(chunk, { onConflict: "tenant_id,n3_customer_code" });
      if (upErr) {
        result.failed += chunk.length;
        // Record error against rows so admin can inspect.
        await this.admin
          .from("customer_contract_snapshots")
          .update({ calculation_error: upErr.message })
          .eq("tenant_id", tenantId)
          .in(
            "n3_customer_code",
            chunk.map((c) => c.n3_customer_code!).filter(Boolean),
          );
        continue;
      }
      result.written += chunk.length;
    }
    return result;
  }
}
