/**
 * Server functions for Milestone 1.2.7 — Administrator Settings.
 * Owner/admin only. Read is scoped by tenant membership via RLS.
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

export type TenantMeta = {
  id: string;
  name: string;
  n3TenantCode: string | null;
  n3CompanyName: string | null;
  n3ApiKeyRef: string | null;
};

export const getTenantMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => i)
  .handler(async ({ data, context }): Promise<TenantMeta> => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const { data: t, error } = await context.supabase
      .from("tenants")
      .select("id, name, n3_tenant_code, n3_company_name, n3_api_key_ref")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!t) throw new Error("Tenant not found");
    return {
      id: t.id,
      name: t.name,
      n3TenantCode: t.n3_tenant_code,
      n3CompanyName: t.n3_company_name,
      n3ApiKeyRef: t.n3_api_key_ref,
    };
  });

/** Test PAT connectivity to N3. Never returns the key. */
export const testN3Connection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => i)
  .handler(async ({ data, context }) => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const { data: t, error } = await context.supabase
      .from("tenants")
      .select("n3_api_key_ref")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!t?.n3_api_key_ref) {
      return { ok: false as const, error: "No API key reference configured" };
    }
    const apiKey = process.env[t.n3_api_key_ref];
    if (!apiKey) {
      return { ok: false as const, error: `Secret ${t.n3_api_key_ref} is not set` };
    }
    try {
      const { N3Client } = await import("@/lib/n3");
      const client = new N3Client();
      const res = await client.auth.connectWithApiKey(apiKey);
      return {
        ok: true as const,
        company: res.company ?? null,
        tenantCode: res.tenantCode ?? null,
        expiresAt: res.expiresAt ?? null,
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

// ---------- Stock lookup (from synced servicehub_stock) ----------

export type StockOption = { code: string; description: string | null };

export const listStockOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; search?: string }) => i)
  .handler(async ({ data, context }): Promise<StockOption[]> => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    let q = context.supabase
      .from("servicehub_stock")
      .select("n3_code, description")
      .eq("tenant_id", data.tenantId)
      .eq("is_active", true)
      .order("n3_code", { ascending: true })
      .limit(500);
    if (data.search && data.search.trim().length > 0) {
      const s = `%${data.search.trim()}%`;
      q = q.or(`n3_code.ilike.${s},description.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? [])
      .filter((r): r is { n3_code: string; description: string | null } => !!r.n3_code)
      .map((r) => ({ code: r.n3_code, description: r.description }));
  });

// ---------- Renewal stock mapping ----------

export type RenewalMappingRow = {
  id: string;
  stockCode: string;
  description: string | null;
  contractDays: number;
  serviceType: string;
  isActive: boolean;
};

export const listRenewalMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => i)
  .handler(async ({ data, context }): Promise<RenewalMappingRow[]> => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const { data: rows, error } = await context.supabase
      .from("renewal_stock_mapping")
      .select("id, stock_code, description, contract_days, service_type, is_active")
      .eq("tenant_id", data.tenantId)
      .order("stock_code");
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      stockCode: r.stock_code,
      description: r.description,
      contractDays: r.contract_days,
      serviceType: r.service_type,
      isActive: r.is_active,
    }));
  });

export const upsertRenewalMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      tenantId: string;
      id?: string;
      stockCode: string;
      description?: string | null;
      contractDays: number;
      serviceType?: string;
      isActive?: boolean;
    }) => i,
  )
  .handler(async ({ data, context }) => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const payload = {
      tenant_id: data.tenantId,
      stock_code: data.stockCode.trim(),
      description: data.description ?? null,
      contract_days: data.contractDays,
      service_type: data.serviceType ?? "contract",
      is_active: data.isActive ?? true,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("renewal_stock_mapping")
        .update(payload)
        .eq("id", data.id)
        .eq("tenant_id", data.tenantId);
      if (error) throw error;
    } else {
      const { error } = await context.supabase
        .from("renewal_stock_mapping")
        .upsert(payload, { onConflict: "tenant_id,stock_code" });
      if (error) throw error;
    }
    return { ok: true };
  });

export const setRenewalMappingActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; id: string; isActive: boolean }) => i)
  .handler(async ({ data, context }) => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const { error } = await context.supabase
      .from("renewal_stock_mapping")
      .update({ is_active: data.isActive })
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Ad-hoc stock mapping ----------

export type AdhocMappingRow = {
  id: string;
  stockCode: string;
  description: string | null;
  serviceType: string;
  isActive: boolean;
};

export const listAdhocMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => i)
  .handler(async ({ data, context }): Promise<AdhocMappingRow[]> => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const { data: rows, error } = await context.supabase
      .from("adhoc_stock_mapping")
      .select("id, stock_code, description, service_type, is_active")
      .eq("tenant_id", data.tenantId)
      .order("stock_code");
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      stockCode: r.stock_code,
      description: r.description,
      serviceType: r.service_type,
      isActive: r.is_active,
    }));
  });

export const upsertAdhocMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      tenantId: string;
      id?: string;
      stockCode: string;
      description?: string | null;
      serviceType?: string;
      isActive?: boolean;
    }) => i,
  )
  .handler(async ({ data, context }) => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const payload = {
      tenant_id: data.tenantId,
      stock_code: data.stockCode.trim(),
      description: data.description ?? null,
      service_type: data.serviceType ?? "ad_hoc",
      is_active: data.isActive ?? true,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("adhoc_stock_mapping")
        .update(payload)
        .eq("id", data.id)
        .eq("tenant_id", data.tenantId);
      if (error) throw error;
    } else {
      const { error } = await context.supabase
        .from("adhoc_stock_mapping")
        .upsert(payload, { onConflict: "tenant_id,stock_code" });
      if (error) throw error;
    }
    return { ok: true };
  });

export const setAdhocMappingActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; id: string; isActive: boolean }) => i)
  .handler(async ({ data, context }) => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const { error } = await context.supabase
      .from("adhoc_stock_mapping")
      .update({ is_active: data.isActive })
      .eq("id", data.id)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- General settings ----------

export type GeneralSettings = {
  dueSoonDays: 30 | 45 | 60 | 90;
  jobPrefix: string;
  timezone: string;
  notificationEnabled: boolean;
};

export const getGeneralSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string }) => i)
  .handler(async ({ data, context }): Promise<GeneralSettings> => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const { data: row, error } = await context.supabase
      .from("general_settings")
      .select("due_soon_days, job_prefix, timezone, notification_enabled")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      const { data: inserted, error: iErr } = await context.supabase
        .from("general_settings")
        .insert({ tenant_id: data.tenantId })
        .select("due_soon_days, job_prefix, timezone, notification_enabled")
        .single();
      if (iErr) throw iErr;
      return {
        dueSoonDays: inserted.due_soon_days as GeneralSettings["dueSoonDays"],
        jobPrefix: inserted.job_prefix,
        timezone: inserted.timezone,
        notificationEnabled: inserted.notification_enabled,
      };
    }
    return {
      dueSoonDays: row.due_soon_days as GeneralSettings["dueSoonDays"],
      jobPrefix: row.job_prefix,
      timezone: row.timezone,
      notificationEnabled: row.notification_enabled,
    };
  });

export const updateGeneralSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      tenantId: string;
      dueSoonDays?: 30 | 45 | 60 | 90;
      jobPrefix?: string;
      notificationEnabled?: boolean;
    }) => i,
  )
  .handler(async ({ data, context }) => {
    await assertTenantAdmin(context.supabase, context.userId, data.tenantId);
    const patch: {
      due_soon_days?: number;
      job_prefix?: string;
      notification_enabled?: boolean;
    } = {};
    if (data.dueSoonDays !== undefined) patch.due_soon_days = data.dueSoonDays;
    if (data.jobPrefix !== undefined) {
      const p = data.jobPrefix.trim().toUpperCase();
      if (!/^[A-Z0-9]{1,6}$/.test(p)) throw new Error("Job prefix must be 1–6 letters/digits");
      patch.job_prefix = p;
    }
    if (data.notificationEnabled !== undefined) patch.notification_enabled = data.notificationEnabled;
    const { error } = await context.supabase
      .from("general_settings")
      .update(patch)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    return { ok: true };
  });
