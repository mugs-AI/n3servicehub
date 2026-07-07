/**
 * Server functions for the ServiceHub synchronization layer.
 *
 * Consumed by the admin verification console. All privileged writes to
 * the synced tables happen server-side via SyncManager under the service
 * role — callers only trigger or read status.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SyncEntity, SyncOutcome } from "@/lib/n3/sync/SyncManager.server";

const ALL_ENTITIES: SyncEntity[] = [
  "customers",
  "stock",
  "users",
  "roles",
  "sales_invoices",
  "delivery_orders",
  "company_profile",
];

export type SyncStatusEntity = {
  entity: SyncEntity;
  intervalMinutes: number;
  isEnabled: boolean;
  nextDueAt: string;
  lastSuccessfulAt: string | null;
  lastWatermark: string | null;
  lastRun: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    inserted: number;
    updated: number;
    processed: number;
    error: string | null;
  } | null;
  recordCount: number;
};

export type SyncStatusReport = {
  tenantId: string;
  tenantName: string;
  entities: SyncStatusEntity[];
};

async function assertTenantAdmin(
  supabase: Awaited<ReturnType<typeof requireSupabaseAuth.server>> extends never
    ? never
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : any,
  userId: string,
  tenantId: string,
): Promise<void> {
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

const TABLE_BY_ENTITY: Record<SyncEntity, string | null> = {
  customers: "servicehub_customers",
  stock: "servicehub_stock",
  users: "servicehub_users",
  roles: "servicehub_roles",
  sales_invoices: "servicehub_sales_invoices",
  delivery_orders: "servicehub_delivery_orders",
  company_profile: null,
};

/**
 * Verification console: full status for one tenant. Admin only.
 */
export const getSyncStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) => input)
  .handler(async ({ data, context }): Promise<SyncStatusReport> => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);

    const { data: tenant, error: tErr } = await context.supabase
      .from("tenants")
      .select("id, name")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!tenant) throw new Error("Tenant not found");

    const { data: schedules, error: sErr } = await context.supabase
      .from("sync_schedules")
      .select("*")
      .eq("tenant_id", data.tenantId);
    if (sErr) throw sErr;

    const scheduleByEntity = new Map(
      (schedules ?? []).map((s) => [s.entity as SyncEntity, s]),
    );

    const entities: SyncStatusEntity[] = [];
    for (const entity of ALL_ENTITIES) {
      const schedule = scheduleByEntity.get(entity);

      // Most recent run for (tenant, entity)
      const { data: lastRuns } = await context.supabase
        .from("sync_runs")
        .select(
          "id, status, started_at, finished_at, duration_ms, inserted_count, updated_count, processed_count, error_message",
        )
        .eq("tenant_id", data.tenantId)
        .eq("entity", entity)
        .order("started_at", { ascending: false })
        .limit(1);
      const lastRun = lastRuns?.[0] ?? null;

      // Record count in the synced table (if any)
      let recordCount = 0;
      const table = TABLE_BY_ENTITY[entity];
      if (table) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count } = await (context.supabase as any)
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", data.tenantId);
        recordCount = count ?? 0;
      }

      entities.push({
        entity,
        intervalMinutes: schedule?.interval_minutes ?? 0,
        isEnabled: schedule?.is_enabled ?? false,
        nextDueAt: schedule?.next_due_at ?? new Date(0).toISOString(),
        lastSuccessfulAt: schedule?.last_successful_at ?? null,
        lastWatermark: schedule?.last_watermark ?? null,
        lastRun: lastRun
          ? {
              id: lastRun.id,
              status: lastRun.status,
              startedAt: lastRun.started_at,
              finishedAt: lastRun.finished_at,
              durationMs: lastRun.duration_ms,
              inserted: lastRun.inserted_count,
              updated: lastRun.updated_count,
              processed: lastRun.processed_count,
              error: lastRun.error_message,
            }
          : null,
        recordCount,
      });
    }

    return { tenantId: tenant.id, tenantName: tenant.name, entities };
  });

/**
 * Manually trigger sync for one or more entities (admin only).
 */
export const triggerSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string; entities?: SyncEntity[] }) => input)
  .handler(async ({ data, context }): Promise<SyncOutcome[]> => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { SyncManager } = await import("@/lib/n3/sync/SyncManager.server");
    const mgr = new SyncManager(supabaseAdmin);
    return mgr.runEntities(
      data.tenantId,
      data.entities && data.entities.length > 0 ? data.entities : ALL_ENTITIES,
      `manual:${context.userId}`,
    );
  });

/**
 * List tenants where the caller is an owner/admin. Used to populate the
 * verification console's tenant selector.
 */
export const listAdminTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("users_local")
      .select("tenant_id, role, tenants:tenant_id(id, name)")
      .eq("auth_user_id", context.userId)
      .eq("is_active", true)
      .in("role", ["owner", "admin"]);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      tenantId: r.tenant_id,
      role: r.role,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      name: (r as any).tenants?.name ?? "",
    }));
  });
