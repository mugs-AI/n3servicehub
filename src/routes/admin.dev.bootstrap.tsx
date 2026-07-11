/**
 * First-tenant bootstrap page — PUBLIC access only while `tenants` is empty.
 *
 * Once the first tenant exists, this page refuses to render the form and
 * directs the user to sign in as an administrator instead. The server
 * function enforces the same gate, so this page cannot be abused after
 * bootstrap.
 *
 * The raw N3 PAT is NEVER submitted here — only the *name* of the Lovable
 * Cloud secret that holds it.
 */

import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  bootstrapFirstTenant,
  getBootstrapState,
  type BootstrapResult,
  type BootstrapState,
} from "@/lib/bootstrap.functions";

export const Route = createFileRoute("/admin/dev/bootstrap")({
  component: BootstrapPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Bootstrap error</h1>
        <p className="mt-2 text-sm text-red-600">{error.message}</p>
        <button
          className="mt-4 rounded border px-3 py-1 text-sm"
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Retry
        </button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-8">Bootstrap page not found.</div>,
});

function BootstrapPage() {
  const router = useRouter();
  const loadState = useServerFn(getBootstrapState);
  const runBootstrap = useServerFn(bootstrapFirstTenant);

  const [state, setState] = useState<BootstrapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<BootstrapResult | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [n3TenantCode, setN3TenantCode] = useState("");
  const [n3CompanyName, setN3CompanyName] = useState("");
  const [n3ApiKeyRef, setN3ApiKeyRef] = useState("N3_API_KEY");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [adminN3UserId, setAdminN3UserId] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  useEffect(() => {
    loadState()
      .then((s) => setState(s))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [loadState]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await runBootstrap({
        data: {
          companyName,
          n3TenantCode,
          n3CompanyName: n3CompanyName || null,
          n3ApiKeyRef,
          adminEmail,
          adminPassword,
          adminDisplayName: adminDisplayName || null,
          adminN3UserId: adminN3UserId || null,
          timezone: timezone || "UTC",
        },
      });
      // Sign the freshly-provisioned admin in so /admin/sync opens directly.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: adminEmail.trim().toLowerCase(),
        password: adminPassword,
      });
      if (signInErr) {
        // Bootstrap succeeded but auto-login failed — send to /auth.
        setResult(r);
        setErr(
          `Tenant created, but automatic sign-in failed: ${signInErr.message}. Please sign in manually.`,
        );
        return;
      }
      setResult(r);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;

  // Gate: once a tenant exists, this page refuses to render the form.
  if (state?.hasTenant && !result) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">Bootstrap already completed</h1>
        <p className="mt-2 text-sm text-gray-600">
          A tenant already exists ({state.tenantCount}). The first-tenant
          bootstrap page is closed. Sign in as an administrator to manage the
          system.
        </p>
        <div className="mt-6 flex gap-2">
          <Link
            to="/auth"
            search={{ redirect: "/admin/dev/sync", reason: "auth_required" as const }}
            className="rounded bg-black px-3 py-1.5 text-sm text-white"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">Bootstrap complete</h1>
        <ul className="mt-4 space-y-2 text-sm">
          <li>✅ Tenant created — <strong>{result.tenantName}</strong> ({result.tenantSlug})</li>
          <li>✅ Admin (owner) user created and linked to your login</li>
          <li>
            {result.secretConfigured ? "✅" : "⚠️"} API secret reference configured —{" "}
            <code className="rounded bg-gray-100 px-1">{result.n3ApiKeyRef}</code>{" "}
            {result.secretConfigured
              ? "(secret found in environment)"
              : "(secret NOT found — add a Lovable Cloud Secret with this exact name before running sync)"}
          </li>
        </ul>
        <div className="mt-6 flex gap-2">
          <button
            className="rounded bg-black px-3 py-1.5 text-sm text-white"
            onClick={() => router.navigate({ to: "/admin/dev/sync" })}
          >
            Go to Sync Console
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Administrator Bootstrap</h1>
        <p className="mt-1 text-sm text-gray-600">
          Create the first ServiceHub tenant and its owner administrator
          account. This page is open only until the first tenant exists.
        </p>
      </header>

      <div className="mb-6 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-medium">N3 API key is already stored securely</p>
        <p className="mt-1">
          A Lovable Cloud Secret named{" "}
          <code className="rounded bg-white px-1">N3_API_KEY</code> holds the
          raw PAT. Leave the reference field below as{" "}
          <code className="rounded bg-white px-1">N3_API_KEY</code> unless you
          added the secret under a different name.
        </p>
      </div>

      {err && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {err}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Company name *</label>
            <input
              className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">N3 tenant code / company id *</label>
              <input
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
                value={n3TenantCode}
                onChange={(e) => setN3TenantCode(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium">N3 company name</label>
              <input
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
                value={n3CompanyName}
                onChange={(e) => setN3CompanyName(e.target.value)}
                placeholder="Defaults to Company name"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">
              n3_api_key_ref (Lovable Cloud Secret name) *
            </label>
            <input
              className="mt-1 w-full rounded border px-3 py-1.5 font-mono text-sm"
              value={n3ApiKeyRef}
              onChange={(e) => setN3ApiKeyRef(e.target.value)}
              required
              pattern="[A-Za-z_][A-Za-z0-9_]*"
            />
            <p className="mt-1 text-xs text-gray-500">
              Only the reference name is saved. The PAT itself must exist as a
              Lovable Cloud Secret with this exact name.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Admin email *</label>
              <input
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium">
                Admin password * <span className="text-xs text-gray-500">(min 8 chars)</span>
              </label>
              <input
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Admin display name</label>
              <input
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
                value={adminDisplayName}
                onChange={(e) => setAdminDisplayName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Admin N3 user code</label>
              <input
                className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
                value={adminN3UserId}
                onChange={(e) => setAdminN3UserId(e.target.value)}
                placeholder="Optional, e.g. USR001"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">Timezone</label>
            <input
              className="mt-1 w-full rounded border px-3 py-1.5 text-sm"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {busy ? "Creating tenant…" : "Create first tenant"}
          </button>
        </fieldset>
      </form>
    </div>
  );
}
