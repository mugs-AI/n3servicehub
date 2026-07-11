/**
 * SyncManager (server-only)
 *
 * Centralized synchronization orchestrator between N3.QNE.Cloud and
 * ServiceHub. Reuses the existing SDK (`N3Client` -> `ConnectionManager`,
 * `AuthService`, service classes). Never runs in the browser.
 *
 * Flow (per tenant):
 *   ConnectionManager → Authentication → Customer → Stock → User → Role
 *   → Invoice → Delivery Order → Renewal Engine (future)
 *
 * Each entity's sync is idempotent: rows are UPSERTed on
 * (tenant_id, n3_record_id). Runs are logged in `sync_runs`, and
 * `sync_schedules.last_watermark` is advanced only after a successful
 * incremental fetch (Sales Invoices, Delivery Orders).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { N3Client, N3ApiError } from "@/lib/n3";
import type { Database } from "@/integrations/supabase/types";

export type SyncEntity =
  | "customers"
  | "stock"
  | "users"
  | "roles"
  | "sales_invoices"
  | "delivery_orders"
  | "company_profile";

export type SyncOutcome = {
  entity: SyncEntity;
  status: "success" | "failed" | "partial";
  inserted: number;
  updated: number;
  processed: number;
  durationMs: number;
  error?: string;
  watermarkUsed?: string | null;
};

type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];

const BATCH_TOP = 200;
const HARD_PAGE_LIMIT = 25; // safety valve — max 5,000 rows / entity / run

/**
 * Resolve the per-tenant N3 PAT.
 *
 * ServiceHub stores only the *name* of the environment variable that
 * carries the PAT (in `tenants.n3_api_key_ref`) so the secret itself
 * lives in Lovable Cloud's secret store, never in the database.
 */
function resolveTenantApiKey(tenant: Pick<TenantRow, "n3_api_key_ref">): string | null {
  const ref = tenant.n3_api_key_ref;
  if (!ref) return null;
  const raw = process.env[ref];
  return raw && raw.length > 0 ? raw : null;
}

export class SyncManager {
  constructor(private admin: SupabaseClient<Database>) {}

  /**
   * Runs every entity that is currently due for the given tenant.
   * Called by the cron tick handler.
   */
  async runDueForTenant(tenantId: string): Promise<SyncOutcome[]> {
    const { data: schedules, error } = await this.admin
      .from("sync_schedules")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_enabled", true)
      .lte("next_due_at", new Date().toISOString());
    if (error) throw error;
    if (!schedules || schedules.length === 0) return [];

    return this.runEntities(
      tenantId,
      schedules.map((s) => s.entity as SyncEntity),
      "scheduler",
    );
  }

  /** Runs a specific entity list for a tenant (used by admin console). */
  async runEntities(
    tenantId: string,
    entities: SyncEntity[],
    triggeredBy: string,
  ): Promise<SyncOutcome[]> {
    const tenant = await this.loadTenant(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const apiKey = resolveTenantApiKey(tenant);
    const client = new N3Client();
    let authFailure: string | null = null;
    if (!apiKey) {
      authFailure = tenant.n3_api_key_ref
        ? `N3 PAT not available in environment variable '${tenant.n3_api_key_ref}'.`
        : "Tenant has no configured N3 API key reference (tenants.n3_api_key_ref).";
    } else {
      try {
        await client.auth.connectWithApiKey(apiKey);
      } catch (err) {
        authFailure = err instanceof Error ? err.message : "N3 authentication failed";
      }
    }

    const outcomes: SyncOutcome[] = [];
    for (const entity of entities) {
      outcomes.push(await this.runEntity(tenant, client, entity, triggeredBy, authFailure));
    }
    return outcomes;
  }

  private async loadTenant(tenantId: string): Promise<TenantRow | null> {
    const { data, error } = await this.admin
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  private async runEntity(
    tenant: TenantRow,
    client: N3Client,
    entity: SyncEntity,
    triggeredBy: string,
    authFailure: string | null,
  ): Promise<SyncOutcome> {
    const startedAt = new Date();
    const { data: run, error: runErr } = await this.admin
      .from("sync_runs")
      .insert({
        tenant_id: tenant.id,
        entity,
        status: "running",
        started_at: startedAt.toISOString(),
        triggered_by: triggeredBy,
      })
      .select("id")
      .single();
    if (runErr || !run) throw runErr ?? new Error("sync_runs insert failed");

    if (authFailure) {
      return this.finalizeRun(run.id, entity, startedAt, {
        status: "failed",
        inserted: 0,
        updated: 0,
        processed: 0,
        error: authFailure,
      });
    }

    // Load the schedule row so we know the incremental watermark.
    const { data: schedule } = await this.admin
      .from("sync_schedules")
      .select("last_watermark")
      .eq("tenant_id", tenant.id)
      .eq("entity", entity)
      .maybeSingle();
    const watermark = schedule?.last_watermark ?? null;

    try {
      const result = await this.dispatch(tenant, client, entity, watermark);
      const nextWatermark = result.newWatermark ?? watermark;
      const nextDue = await this.computeNextDue(tenant.id, entity);
      await this.admin
        .from("sync_schedules")
        .update({
          last_successful_at: new Date().toISOString(),
          last_watermark: nextWatermark,
          next_due_at: nextDue,
        })
        .eq("tenant_id", tenant.id)
        .eq("entity", entity);

      // Auto-recalc Customer Contract Status for affected customers.
      if (
        (entity === "sales_invoices" || entity === "delivery_orders") &&
        result.affectedCustomerCodes &&
        result.affectedCustomerCodes.length > 0
      ) {
        try {
          const { ContractStatusEngine } = await import(
            "@/lib/contract-status/ContractStatusEngine.server"
          );
          const engine = new ContractStatusEngine(this.admin);
          await engine.recalculateForCustomers(tenant.id, result.affectedCustomerCodes);
        } catch {
          // Non-fatal: sync succeeded even if recalc failed.
        }
      }

      return this.finalizeRun(run.id, entity, startedAt, {
        status: "success",
        inserted: result.inserted,
        updated: result.updated,
        processed: result.processed,
        watermarkUsed: watermark,
      });
    } catch (err) {
      const message =
        err instanceof N3ApiError
          ? `[${err.code}] ${err.message}`
          : err instanceof Error
            ? err.message
            : "Unknown sync error";
      // Advance next_due_at even on failure so we don't spin.
      const nextDue = await this.computeNextDue(tenant.id, entity);
      await this.admin
        .from("sync_schedules")
        .update({ next_due_at: nextDue })
        .eq("tenant_id", tenant.id)
        .eq("entity", entity);
      return this.finalizeRun(run.id, entity, startedAt, {
        status: "failed",
        inserted: 0,
        updated: 0,
        processed: 0,
        error: message,
        watermarkUsed: watermark,
      });
    }
  }

  private async computeNextDue(tenantId: string, entity: SyncEntity): Promise<string> {
    const { data } = await this.admin
      .from("sync_schedules")
      .select("interval_minutes")
      .eq("tenant_id", tenantId)
      .eq("entity", entity)
      .maybeSingle();
    const mins = data?.interval_minutes ?? 60;
    return new Date(Date.now() + mins * 60_000).toISOString();
  }

  private async finalizeRun(
    runId: string,
    entity: SyncEntity,
    startedAt: Date,
    partial: {
      status: "success" | "failed" | "partial";
      inserted: number;
      updated: number;
      processed: number;
      error?: string;
      watermarkUsed?: string | null;
    },
  ): Promise<SyncOutcome> {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    await this.admin
      .from("sync_runs")
      .update({
        status: partial.status,
        finished_at: finishedAt.toISOString(),
        duration_ms: durationMs,
        inserted_count: partial.inserted,
        updated_count: partial.updated,
        processed_count: partial.processed,
        error_message: partial.error ?? null,
        watermark_used: partial.watermarkUsed ?? null,
      })
      .eq("id", runId);
    return {
      entity,
      status: partial.status,
      inserted: partial.inserted,
      updated: partial.updated,
      processed: partial.processed,
      durationMs,
      error: partial.error,
      watermarkUsed: partial.watermarkUsed ?? null,
    };
  }

  // -----------------------------------------------------------------
  // Per-entity dispatch
  // -----------------------------------------------------------------

  private async dispatch(
    tenant: TenantRow,
    client: N3Client,
    entity: SyncEntity,
    watermark: string | null,
  ): Promise<{
    inserted: number;
    updated: number;
    processed: number;
    newWatermark?: string | null;
    affectedCustomerCodes?: string[];
  }> {
    switch (entity) {
      case "customers":       return this.syncCustomers(tenant, client);
      case "stock":           return this.syncStock(tenant, client);
      case "users":           return this.syncUsers(tenant, client);
      case "roles":           return this.syncRoles(tenant, client);
      case "sales_invoices":  return this.syncSalesInvoices(tenant, client, watermark);
      case "delivery_orders": return this.syncDeliveryOrders(tenant, client, watermark);
      case "company_profile":
        // Company profile is a single record. The public OpenAPI does not
        // expose a dedicated /api/Company endpoint — the tenant row already
        // stores `n3_company_name` / `n3_tenant_code` from onboarding.
        // This is a no-op success until a company endpoint is added upstream.
        return { inserted: 0, updated: 0, processed: 0 };
    }
  }

  /** Generic paged OData fetch that stops at HARD_PAGE_LIMIT. */
  private async fetchAll<T>(
    fetchPage: (skip: number, top: number) => Promise<{ value: T[]; count: number }>,
  ): Promise<T[]> {
    const rows: T[] = [];
    for (let page = 0; page < HARD_PAGE_LIMIT; page++) {
      const skip = page * BATCH_TOP;
      const res = await fetchPage(skip, BATCH_TOP);
      const chunk = res?.value ?? [];
      rows.push(...chunk);
      if (chunk.length < BATCH_TOP) break;
    }
    return rows;
  }

  /** Upsert helper that reports insert/update counts. */
  private async upsertBatch<TRow extends { tenant_id: string; n3_record_id: string }>(
    table:
      | "servicehub_customers"
      | "servicehub_stock"
      | "servicehub_users"
      | "servicehub_roles"
      | "servicehub_sales_invoices"
      | "servicehub_delivery_orders",
    tenantId: string,
    rows: TRow[],
  ): Promise<{ inserted: number; updated: number }> {
    if (rows.length === 0) return { inserted: 0, updated: 0 };
    const ids = rows.map((r) => r.n3_record_id);
    const { data: existing } = await this.admin
      .from(table)
      .select("n3_record_id")
      .eq("tenant_id", tenantId)
      .in("n3_record_id", ids);
    const existingSet = new Set((existing ?? []).map((r) => r.n3_record_id));
    const inserted = rows.filter((r) => !existingSet.has(r.n3_record_id)).length;
    const updated = rows.length - inserted;

    // Upsert in chunks to keep payloads bounded.
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await this.admin
        .from(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(chunk as any, { onConflict: "tenant_id,n3_record_id" });
      if (error) throw error;
    }
    return { inserted, updated };
  }

  // -----------------------------------------------------------------
  // Customers (full sync)
  // -----------------------------------------------------------------
  private async syncCustomers(tenant: TenantRow, client: N3Client) {
    const raw = await this.fetchAll<Record<string, unknown>>((skip, top) =>
      client.customers.list({ $top: top, $skip: skip }),
    );
    const now = new Date().toISOString();
    const rows = raw.map((r) => ({
      tenant_id: tenant.id,
      n3_record_id: String(r.id ?? r.ID ?? r.code ?? ""),
      n3_code: (r.code as string) ?? (r.customerCode as string) ?? null,
      name: (r.name as string) ?? (r.customerName as string) ?? null,
      email: (r.email as string) ?? null,
      phone: (r.phone1 as string) ?? (r.phone as string) ?? null,
      currency_code: (r.currencyCode as string) ?? null,
      is_active: (r.isActive as boolean) ?? true,
      payload: r,
      last_sync_at: now,
      sync_status: "success" as const,
    })).filter((r) => r.n3_record_id.length > 0);
    const counts = await this.upsertBatch("servicehub_customers", tenant.id, rows);
    return { ...counts, processed: rows.length };
  }

  // -----------------------------------------------------------------
  // Stock (full sync)
  // -----------------------------------------------------------------
  private async syncStock(tenant: TenantRow, client: N3Client) {
    const raw = await this.fetchAll<Record<string, unknown>>((skip, top) =>
      client.stocks.list({ $top: top, $skip: skip }),
    );
    const now = new Date().toISOString();
    const rows = raw.map((r) => ({
      tenant_id: tenant.id,
      n3_record_id: String(r.id ?? r.ID ?? r.code ?? ""),
      n3_code: (r.code as string) ?? (r.stockCode as string) ?? null,
      description: (r.description as string) ?? (r.name as string) ?? null,
      uom: (r.uom as string) ?? (r.baseUOM as string) ?? null,
      is_active: (r.isActive as boolean) ?? true,
      payload: r,
      last_sync_at: now,
      sync_status: "success" as const,
    })).filter((r) => r.n3_record_id.length > 0);
    const counts = await this.upsertBatch("servicehub_stock", tenant.id, rows);
    return { ...counts, processed: rows.length };
  }

  // -----------------------------------------------------------------
  // N3 Users (full sync — Users_GetUsers_GET returns a flat array)
  // -----------------------------------------------------------------
  private async syncUsers(tenant: TenantRow, client: N3Client) {
    const list = await client.users.list();
    const raw = Array.isArray(list) ? list : [];
    const now = new Date().toISOString();
    const rows = raw
      .map((r) => ({
        tenant_id: tenant.id,
        n3_record_id: String(r.id ?? r.ID ?? r.email ?? ""),
        email: (r.email as string) ?? null,
        name: (r.name as string) ?? (r.displayName as string) ?? null,
        is_active: (r.isActive as boolean) ?? true,
        payload: r as Record<string, unknown>,
        last_sync_at: now,
        sync_status: "success" as const,
      }))
      .filter((r) => r.n3_record_id.length > 0);
    const counts = await this.upsertBatch("servicehub_users", tenant.id, rows);
    return { ...counts, processed: rows.length };
  }

  // -----------------------------------------------------------------
  // Roles (derived from user role attachments)
  //
  // The N3 Platform OpenAPI does not expose a role catalogue endpoint
  // (see RoleService). We derive the tenant's role catalogue from the
  // roles referenced on synced N3 users, so downstream ServiceHub code
  // has a stable local read model.
  // -----------------------------------------------------------------
  private async syncRoles(tenant: TenantRow, client: N3Client) {
    const list = await client.users.list();
    const raw = Array.isArray(list) ? list : [];
    const seen = new Map<string, { name: string | null; payload: Record<string, unknown> }>();
    for (const u of raw) {
      const roles = (u as { roles?: Array<Record<string, unknown>> }).roles;
      if (!Array.isArray(roles)) continue;
      for (const role of roles) {
        const id = String(role.id ?? role.roleId ?? role.name ?? "");
        if (!id || seen.has(id)) continue;
        seen.set(id, {
          name: (role.name as string) ?? (role.roleName as string) ?? null,
          payload: role,
        });
      }
    }
    const now = new Date().toISOString();
    const rows = Array.from(seen.entries()).map(([id, r]) => ({
      tenant_id: tenant.id,
      n3_record_id: id,
      name: r.name,
      source: "derived_from_users",
      payload: r.payload,
      last_sync_at: now,
      sync_status: "success" as const,
    }));
    const counts = await this.upsertBatch("servicehub_roles", tenant.id, rows);
    return { ...counts, processed: rows.length };
  }

  // -----------------------------------------------------------------
  // Sales Invoices (incremental via OData $filter on LastModifiedDate)
  // -----------------------------------------------------------------
  private async syncSalesInvoices(
    tenant: TenantRow,
    client: N3Client,
    watermark: string | null,
  ) {
    const filter = watermark ? `LastModifiedDate gt ${watermark}` : undefined;
    const raw = await this.fetchAll<Record<string, unknown>>((skip, top) =>
      client.invoices.list({
        $top: top,
        $skip: skip,
        $orderby: "LastModifiedDate asc",
        ...(filter ? { $filter: filter } : {}),
      }),
    );
    const now = new Date().toISOString();
    let maxModified: string | null = watermark;
    const rows = raw
      .map((r) => {
        const lm =
          (r.lastModifiedDate as string) ??
          (r.LastModifiedDate as string) ??
          (r.modifiedDate as string) ??
          null;
        if (lm && (!maxModified || lm > maxModified)) maxModified = lm;
        return {
          tenant_id: tenant.id,
          n3_record_id: String(r.id ?? r.ID ?? r.docNo ?? ""),
          doc_no: (r.docNo as string) ?? null,
          n3_customer_code: (r.customerCode as string) ?? (r.customer as string) ?? null,
          n3_customer_name: (r.customerName as string) ?? null,
          doc_date: (r.docDate as string) ?? null,
          total_amount: (r.netTotal as number) ?? (r.total as number) ?? null,
          currency_code: (r.currencyCode as string) ?? null,
          is_cancelled: (r.isCancelled as boolean) ?? false,
          n3_last_modified: lm,
          payload: r,
          last_sync_at: now,
          sync_status: "success" as const,
        };
      })
      .filter((r) => r.n3_record_id.length > 0);
    const counts = await this.upsertBatch("servicehub_sales_invoices", tenant.id, rows);
    const affectedCustomerCodes = Array.from(
      new Set(rows.map((r) => r.n3_customer_code).filter((c): c is string => !!c)),
    );
    return { ...counts, processed: rows.length, newWatermark: maxModified, affectedCustomerCodes };
  }

  // -----------------------------------------------------------------
  // Delivery Orders (incremental via OData $filter on LastModifiedDate)
  // -----------------------------------------------------------------
  private async syncDeliveryOrders(
    tenant: TenantRow,
    client: N3Client,
    watermark: string | null,
  ) {
    const filter = watermark ? `LastModifiedDate gt ${watermark}` : undefined;
    const raw = await this.fetchAll<Record<string, unknown>>((skip, top) =>
      client.deliveryOrders.list({
        $top: top,
        $skip: skip,
        $orderby: "LastModifiedDate asc",
        ...(filter ? { $filter: filter } : {}),
      }),
    );
    const now = new Date().toISOString();
    let maxModified: string | null = watermark;
    const rows = raw
      .map((r) => {
        const lm =
          (r.lastModifiedDate as string) ??
          (r.LastModifiedDate as string) ??
          (r.modifiedDate as string) ??
          null;
        if (lm && (!maxModified || lm > maxModified)) maxModified = lm;
        return {
          tenant_id: tenant.id,
          n3_record_id: String(r.id ?? r.ID ?? r.docNo ?? ""),
          doc_no: (r.docNo as string) ?? null,
          n3_customer_code: (r.customerCode as string) ?? null,
          n3_customer_name: (r.customerName as string) ?? null,
          doc_date: (r.docDate as string) ?? null,
          is_cancelled: (r.isCancelled as boolean) ?? false,
          n3_last_modified: lm,
          payload: r,
          last_sync_at: now,
          sync_status: "success" as const,
        };
      })
      .filter((r) => r.n3_record_id.length > 0);
    const counts = await this.upsertBatch("servicehub_delivery_orders", tenant.id, rows);
    const affectedCustomerCodes = Array.from(
      new Set(rows.map((r) => r.n3_customer_code).filter((c): c is string => !!c)),
    );
    return { ...counts, processed: rows.length, newWatermark: maxModified, affectedCustomerCodes };
  }
}
