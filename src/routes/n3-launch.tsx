import { createFileRoute, useSearch, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getMyTenants } from "@/lib/support.functions";

/**
 * N3 Embedded Launch — Milestone 1.5B (Diagnostic Only).
 *
 * SECURITY CONTRACT:
 * - Never displays the raw token.
 * - Never logs the raw token (no console.*, no server call, no storage).
 * - Never persists the token to database, localStorage, sessionStorage,
 *   activity logs or analytics.
 * - Never mints a Supabase session from the token.
 * - Sensitive claim VALUES are redacted; only claim NAMES are surfaced.
 * - Full diagnostic panel is Administrator-only. Non-admins see a generic
 *   "pending official spec" message.
 *
 * Real token validation is deferred until N3 publishes the official handoff
 * specification (signing key, issuer, audience, tenant/user/role claims).
 */

const searchSchema = z.object({
  token: z.string().optional(),
  tenant: z.string().optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/n3-launch")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "N3 Launch — ServiceHub" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: N3LaunchPage,
});

type TokenFormat = "jwt-like" | "opaque" | "unknown" | "absent";

interface Diagnostic {
  present: boolean;
  format: TokenFormat;
  tokenLength: number | null;
  header: { alg?: string; typ?: string; kid?: string } | null;
  claimNames: string[];
  issuer: string | null;
  audience: string | null;
  expiry: string | null;
  tenantClaimNames: string[];
  userClaimNames: string[];
  roleClaimNames: string[];
  validation: string;
  headerDecodeError: string | null;
  payloadDecodeError: string | null;
}

const TENANT_KEYWORDS = ["tenant", "org", "organisation", "organization", "company", "companycode", "tid"];
const USER_KEYWORDS = ["user", "username", "userid", "uid", "email", "sub", "preferred_username"];
const ROLE_KEYWORDS = ["role", "roles", "perm", "permission", "permissions", "scope", "scopes", "group", "groups"];
const SAFE_ISS_AUD_PATTERN = /^[A-Za-z0-9._:/@-]+$/;

function base64UrlDecode(input: string): string | null {
  try {
    const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
    const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
    if (typeof atob !== "function") return null;
    const bin = atob(b64);
    // Decode as UTF-8
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function classifyKey(name: string, buckets: { tenant: string[]; user: string[]; role: string[] }) {
  const lower = name.toLowerCase();
  if (TENANT_KEYWORDS.some((k) => lower.includes(k))) buckets.tenant.push(name);
  if (USER_KEYWORDS.some((k) => lower === k || lower.includes(k))) buckets.user.push(name);
  if (ROLE_KEYWORDS.some((k) => lower.includes(k))) buckets.role.push(name);
}

function safeScalar(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const s = String(value);
  if (s.length > 200) return null;
  if (!SAFE_ISS_AUD_PATTERN.test(s)) return null;
  return s;
}

function inspectToken(token: string | undefined): Diagnostic {
  if (!token) {
    return {
      present: false,
      format: "absent",
      tokenLength: null,
      header: null,
      claimNames: [],
      issuer: null,
      audience: null,
      expiry: null,
      tenantClaimNames: [],
      userClaimNames: [],
      roleClaimNames: [],
      validation: "Not implemented / Pending official N3 specification",
      headerDecodeError: null,
      payloadDecodeError: null,
    };
  }

  const parts = token.split(".");
  const looksJwt = parts.length === 3 && parts.every((p) => p.length > 0);
  const base: Diagnostic = {
    present: true,
    format: looksJwt ? "jwt-like" : /^[A-Za-z0-9._~+/=-]+$/.test(token) ? "opaque" : "unknown",
    tokenLength: token.length,
    header: null,
    claimNames: [],
    issuer: null,
    audience: null,
    expiry: null,
    tenantClaimNames: [],
    userClaimNames: [],
    roleClaimNames: [],
    validation: "Not implemented / Pending official N3 specification",
    headerDecodeError: null,
    payloadDecodeError: null,
  };

  if (!looksJwt) return base;

  const headerJson = base64UrlDecode(parts[0]);
  if (headerJson) {
    try {
      const h = JSON.parse(headerJson) as Record<string, unknown>;
      base.header = {
        alg: typeof h.alg === "string" ? h.alg : undefined,
        typ: typeof h.typ === "string" ? h.typ : undefined,
        kid: typeof h.kid === "string" ? h.kid : undefined,
      };
    } catch {
      base.headerDecodeError = "Header is not valid JSON";
    }
  } else {
    base.headerDecodeError = "Header is not valid base64url";
  }

  const payloadJson = base64UrlDecode(parts[1]);
  if (payloadJson) {
    try {
      const p = JSON.parse(payloadJson) as Record<string, unknown>;
      const names = Object.keys(p).sort();
      base.claimNames = names;

      const buckets = { tenant: [] as string[], user: [] as string[], role: [] as string[] };
      for (const n of names) classifyKey(n, buckets);
      base.tenantClaimNames = buckets.tenant;
      base.userClaimNames = buckets.user;
      base.roleClaimNames = buckets.role;

      base.issuer = safeScalar(p.iss);
      const aud = p.aud;
      base.audience = Array.isArray(aud)
        ? aud.map(safeScalar).filter(Boolean).join(", ") || null
        : safeScalar(aud);

      if (typeof p.exp === "number" && Number.isFinite(p.exp)) {
        try {
          base.expiry = new Date(p.exp * 1000).toISOString();
        } catch {
          base.expiry = null;
        }
      }
    } catch {
      base.payloadDecodeError = "Payload is not valid JSON";
    }
  } else {
    base.payloadDecodeError = "Payload is not valid base64url";
  }

  return base;
}

function N3LaunchPage() {
  const search = useSearch({ from: "/n3-launch" });
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setHasSession(!!data.session);
      setSessionChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tenantsFn = useServerFn(getMyTenants);
  const { data: tenants } = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => tenantsFn(),
    enabled: hasSession,
  });
  const isAdmin = !!tenants?.some((t) => t.profile === "administrator");

  // Inspect purely in-memory; the token is never sent anywhere or stored.
  const diag = useMemo(() => inspectToken(search.token), [search.token]);
  const [copied, setCopied] = useState(false);

  const summaryText = useMemo(() => {
    const lines = [
      "ServiceHub — N3 Launch Diagnostic (sanitized)",
      `Token present: ${diag.present ? "Yes" : "No"}`,
      `Token format: ${diag.format}`,
      `Token length: ${diag.tokenLength ?? "n/a"}`,
      `Header alg: ${diag.header?.alg ?? "n/a"}`,
      `Header typ: ${diag.header?.typ ?? "n/a"}`,
      `Header kid: ${diag.header?.kid ?? "n/a"}`,
      `Claim names: ${diag.claimNames.join(", ") || "n/a"}`,
      `Tenant-related claims: ${diag.tenantClaimNames.join(", ") || "n/a"}`,
      `User-related claims: ${diag.userClaimNames.join(", ") || "n/a"}`,
      `Role/permission claims: ${diag.roleClaimNames.join(", ") || "n/a"}`,
      `Issuer (iss): ${diag.issuer ?? "n/a"}`,
      `Audience (aud): ${diag.audience ?? "n/a"}`,
      `Expiry (exp): ${diag.expiry ?? "n/a"}`,
      `Validation status: ${diag.validation}`,
    ];
    return lines.join("\n");
  }, [diag]);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold">ServiceHub — N3 Launch</h1>
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            N3 launch token received. Secure validation is pending the official
            N3 handoff specification.
          </p>
        </header>

        {!sessionChecked ? (
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        ) : !hasSession ? (
          <div className="rounded-md border bg-card p-4 text-sm">
            <p className="text-muted-foreground">
              This launch endpoint is reserved for N3.QNE.Cloud embedded launch.
              A ServiceHub session was not created because token validation is
              not yet implemented.
            </p>
            <div className="mt-4">
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Sign in with local account
              </Link>
            </div>
          </div>
        ) : !isAdmin ? (
          <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
            Diagnostic details are visible to Administrators only.
            <div className="mt-4">
              <Link
                to="/support"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Go to Support
              </Link>
            </div>
          </div>
        ) : (
          <section className="space-y-4 rounded-md border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Diagnostic (Administrator)</h2>
              <button
                type="button"
                onClick={copySummary}
                className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                {copied ? "Copied" : "Copy Diagnostic Summary"}
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Raw token is never displayed, logged or stored. Only sanitized
              metadata below.
            </p>

            <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2">
              <Row label="Token present" value={diag.present ? "Yes" : "No"} />
              <Row label="Token format" value={diag.format} />
              <Row label="Token length" value={diag.tokenLength?.toString() ?? "n/a"} />
              <Row label="Header alg" value={diag.header?.alg ?? "n/a"} />
              <Row label="Header typ" value={diag.header?.typ ?? "n/a"} />
              <Row label="Header kid" value={diag.header?.kid ?? "n/a"} />
              <Row label="Issuer (iss)" value={diag.issuer ?? "n/a"} />
              <Row label="Audience (aud)" value={diag.audience ?? "n/a"} />
              <Row label="Expiry (exp)" value={diag.expiry ?? "n/a"} />
              <Row label="Validation" value={diag.validation} />
            </dl>

            <ClaimList label="Claim names" items={diag.claimNames} />
            <ClaimList label="Tenant-related claim names" items={diag.tenantClaimNames} />
            <ClaimList label="User-related claim names" items={diag.userClaimNames} />
            <ClaimList label="Role/permission claim names" items={diag.roleClaimNames} />

            {(diag.headerDecodeError || diag.payloadDecodeError) && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                {diag.headerDecodeError && <div>Header: {diag.headerDecodeError}</div>}
                {diag.payloadDecodeError && <div>Payload: {diag.payloadDecodeError}</div>}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs break-all">{value}</dd>
    </>
  );
}

function ClaimList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">n/a</div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1">
          {items.map((n) => (
            <span
              key={n}
              className="rounded border bg-muted px-2 py-0.5 font-mono text-[11px]"
            >
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
