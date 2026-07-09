/**
 * Bootstrap server functions — first-tenant provisioning + admin linkage.
 *
 * Security model:
 *  - Caller must be signed in (requireSupabaseAuth).
 *  - `getBootstrapState` is readable by any authenticated user; it only
 *    reports whether a tenant already exists and whether the current user
 *    is already linked.
 *  - `bootstrapFirstTenant` is only permitted when `tenants` is empty
 *    (true first-run bootstrap). Any subsequent tenant creation must go
 *    through a separate admin flow — out of scope for this milestone.
 *
 * We never accept or store the raw N3 API key. Only the *reference name*
 * (matching a Lovable Cloud Secret) is written to `tenants.n3_api_key_ref`.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BootstrapState = {
  hasTenant: boolean;
  tenantCount: number;
  currentUserLinked: boolean;
  currentUserEmail: string | null;
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

export const getBootstrapState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BootstrapState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count, error: cErr } = await supabaseAdmin
      .from("tenants")
      .select("id", { count: "exact", head: true });
    if (cErr) throw cErr;

    const { data: link, error: lErr } = await supabaseAdmin
      .from("users_local")
      .select("id")
      .eq("auth_user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (lErr) throw lErr;

    return {
      hasTenant: (count ?? 0) > 0,
      tenantCount: count ?? 0,
      currentUserLinked: !!link,
      currentUserEmail: (context.claims?.email as string | undefined) ?? null,
    };
  });

export type BootstrapResult = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  userLocalId: string;
  n3ApiKeyRef: string;
  secretConfigured: boolean;
};

export const bootstrapFirstTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyName: string;
      n3TenantCode: string;
      n3CompanyName?: string | null;
      n3ApiKeyRef: string;
      adminEmail: string;
      adminDisplayName?: string | null;
      adminN3UserId?: string | null;
      timezone?: string | null;
    }) => {
      if (!input.companyName?.trim()) throw new Error("companyName is required");
      if (!input.n3TenantCode?.trim()) throw new Error("n3TenantCode is required");
      if (!input.n3ApiKeyRef?.trim()) throw new Error("n3ApiKeyRef is required");
      if (!input.adminEmail?.trim()) throw new Error("adminEmail is required");
      validateSecretRef(input.n3ApiKeyRef.trim());
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<BootstrapResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Gate: first-tenant only.
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
        auth_user_id: context.userId,
        email: data.adminEmail.trim(),
        display_name: data.adminDisplayName?.trim() || null,
        n3_user_id: data.adminN3UserId?.trim() || null,
        role: "owner",
        is_active: true,
      })
      .select("id")
      .single();
    if (uErr) throw uErr;

    // Best-effort check: is the referenced secret actually present in this env?
    const secretConfigured = Boolean(process.env[apiKeyRef]);

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      userLocalId: userLocal.id,
      n3ApiKeyRef: apiKeyRef,
      secretConfigured,
    };
  });
