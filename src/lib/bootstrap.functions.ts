/**
 * Bootstrap server functions — first-tenant provisioning.
 *
 * Access model (fixes the chicken-and-egg deadlock):
 *  - `getBootstrapState` is PUBLIC (no auth). It only reports whether a
 *    tenant already exists, so the bootstrap page can decide whether to
 *    render itself openly or require an administrator login.
 *  - `bootstrapFirstTenant` is PUBLIC but hard-gated to `tenants` count = 0.
 *    Once the first tenant exists this function refuses all calls. It
 *    creates the auth user via the admin API, then inserts the tenant and
 *    the owner `users_local` row atomically-ish.
 *  - Any subsequent tenant creation must go through a separate authenticated
 *    admin flow — out of scope for this milestone.
 *
 * We never accept or store the raw N3 API key. Only the *reference name*
 * (matching a Lovable Cloud Secret) is written to `tenants.n3_api_key_ref`.
 */

import { createServerFn } from "@tanstack/react-start";

export type BootstrapState = {
  hasTenant: boolean;
  tenantCount: number;
};

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `tenant-${Date.now().toString(36)}`
  );
}

function validateSecretRef(ref: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,255}$/.test(ref)) {
    throw new Error(
      "n3_api_key_ref must match a valid secret name (letters, digits, underscores; starting with a letter or underscore).",
    );
  }
}

export const getBootstrapState = createServerFn({ method: "GET" }).handler(
  async (): Promise<BootstrapState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("tenants")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    return { hasTenant: (count ?? 0) > 0, tenantCount: count ?? 0 };
  },
);

export type BootstrapResult = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  userLocalId: string;
  authUserId: string;
  n3ApiKeyRef: string;
  secretConfigured: boolean;
};

export const bootstrapFirstTenant = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      companyName: string;
      n3TenantCode: string;
      n3CompanyName?: string | null;
      n3ApiKeyRef: string;
      adminEmail: string;
      adminPassword: string;
      adminDisplayName?: string | null;
      adminN3UserId?: string | null;
      timezone?: string | null;
    }) => {
      if (!input.companyName?.trim()) throw new Error("companyName is required");
      if (!input.n3TenantCode?.trim()) throw new Error("n3TenantCode is required");
      if (!input.n3ApiKeyRef?.trim()) throw new Error("n3ApiKeyRef is required");
      if (!input.adminEmail?.trim()) throw new Error("adminEmail is required");
      if (!input.adminPassword || input.adminPassword.length < 8) {
        throw new Error("adminPassword must be at least 8 characters");
      }
      validateSecretRef(input.n3ApiKeyRef.trim());
      return input;
    },
  )
  .handler(async ({ data }): Promise<BootstrapResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Hard gate: first-tenant only. Any existing tenant closes this endpoint.
    const { count, error: cErr } = await supabaseAdmin
      .from("tenants")
      .select("id", { count: "exact", head: true });
    if (cErr) throw cErr;
    if ((count ?? 0) > 0) {
      throw new Error(
        "A tenant already exists. First-tenant bootstrap is disabled.",
      );
    }

    const companyName = data.companyName.trim();
    const tenantCode = data.n3TenantCode.trim();
    const apiKeyRef = data.n3ApiKeyRef.trim();
    const slug = slugify(companyName);
    const email = data.adminEmail.trim().toLowerCase();

    // Create or find the auth user (idempotent-ish).
    let authUserId: string | null = null;
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.adminPassword,
      email_confirm: true,
    });
    if (created.error) {
      // If the user already exists, look them up.
      const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = list.data?.users.find((u) => u.email?.toLowerCase() === email);
      if (!found) throw created.error;
      authUserId = found.id;
    } else {
      authUserId = created.data.user?.id ?? null;
    }
    if (!authUserId) throw new Error("Failed to resolve admin auth user id");

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: companyName,
        slug,
        n3_tenant_code: tenantCode,
        n3_company_name: data.n3CompanyName?.trim() || companyName,
        n3_api_key_ref: apiKeyRef,
        timezone: data.timezone?.trim() || "UTC",
      })
      .select("id, name, slug")
      .single();
    if (tErr) throw tErr;

    const { data: userLocal, error: uErr } = await supabaseAdmin
      .from("users_local")
      .insert({
        tenant_id: tenant.id,
        auth_user_id: authUserId,
        email,
        display_name: data.adminDisplayName?.trim() || null,
        n3_user_id: data.adminN3UserId?.trim() || null,
        role: "owner",
        is_active: true,
      })
      .select("id")
      .single();
    if (uErr) throw uErr;

    const secretConfigured = Boolean(process.env[apiKeyRef]);

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      userLocalId: userLocal.id,
      authUserId,
      n3ApiKeyRef: apiKeyRef,
      secretConfigured,
    };
  });
