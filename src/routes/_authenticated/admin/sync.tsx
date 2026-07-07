/**
 * Admin verification console for the N3 synchronization layer.
 *
 * Read-only status view + manual "sync now" trigger. Admin/owner only —
 * enforced server-side in the underlying server functions.
 */

import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  getSyncStatus,
  listAdminTenants,
  triggerSync,
  type SyncStatusReport,
  type SyncStatusEntity,
} from "@/lib/sync.functions";

export const Route = createFileRoute("/_authenticated/admin/sync")({
  component: SyncConsole,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Sync Console error</h1>
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
  notFoundComponent: () => <div className="p-8">Sync console not found.</div>,
});

const ENTITY_LABEL: Record<SyncStatusEntity["entity"], string> = {
  customers: "Customers",
  stock: "Stock",
  users: "N3 Users",
  roles: "Roles",
  sales_invoices: "Sales Invoices",
  delivery_orders: "Delivery Orders",
  company_profile: "Company Profile",
};

function fmt(dt: string | null): string {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return dt;
  return d.toLocaleString();
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const label = status ?? "never";
  const cls =
    label === "success"
      ? "bg-green-100 text-green-800"
      : label === "running"
        ? "bg-blue-100 text-blue-800"
        : label === "failed"
          ? "bg-red-100 text-red-800"
          : label === "partial"
            ? "bg-amber-100 text-amber-800"
            : "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function SyncConsole() {
  const listTenants = useServerFn(listAdminTenants);
  const fetchStatus = useServerFn(getSyncStatus);
  const runSync = useServerFn(triggerSync);

  const [tenants, setTenants] = useState<Array<{ tenantId: string; name: string }>>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [report, setReport] = useState<SyncStatusReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listTenants()
      .then((rows) => {
        setTenants(rows.map((r) => ({ tenantId: r.tenantId, name: r.name })));
        if (rows.length > 0) setTenantId(rows[0].tenantId);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [listTenants]);

  const refresh = async (id: string) => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchStatus({ data: { tenantId: id } });
      setReport(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) refresh(tenantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const runOne = async (entity: SyncStatusEntity["entity"]) => {
    if (!tenantId) return;
    setBusy(entity);
    setErr(null);
    try {
      await runSync({ data: { tenantId, entities: [entity] } });
      await refresh(tenantId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const runAll = async () => {
    if (!tenantId) return;
    setBusy("__all__");
    setErr(null);
    try {
      await runSync({ data: { tenantId } });
      await refresh(tenantId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">N3 Sync Verification Console</h1>
          <p className="text-sm text-gray-600">
            Read-only. Shows scheduled sync status for every entity and lets
            administrators trigger an immediate re-sync.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded border px-3 py-1.5 text-sm"
            value={tenantId ?? ""}
            onChange={(e) => setTenantId(e.target.value || null)}
          >
            <option value="" disabled>
              Select tenant
            </option>
            {tenants.map((t) => (
              <option key={t.tenantId} value={t.tenantId}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            className="rounded border px-3 py-1.5 text-sm"
            onClick={() => tenantId && refresh(tenantId)}
            disabled={!tenantId || loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={runAll}
            disabled={!tenantId || busy !== null}
          >
            {busy === "__all__" ? "Running…" : "Sync all now"}
          </button>
        </div>
      </header>

      {err && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {err}
        </div>
      )}

      {tenants.length === 0 && !err && (
        <p className="text-sm text-gray-500">
          You are not an owner/admin of any tenant.
        </p>
      )}

      {report && (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Interval</th>
                <th className="px-3 py-2">Records</th>
                <th className="px-3 py-2">Last sync</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Inserted / Updated</th>
                <th className="px-3 py-2">Last error</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {report.entities.map((e) => (
                <tr key={e.entity} className="border-t">
                  <td className="px-3 py-2 font-medium">{ENTITY_LABEL[e.entity]}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={e.lastRun?.status ?? null} />
                  </td>
                  <td className="px-3 py-2">
                    {e.intervalMinutes ? `${e.intervalMinutes} min` : "—"}
                    {!e.isEnabled && (
                      <span className="ml-2 text-xs text-gray-500">(disabled)</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{e.recordCount.toLocaleString()}</td>
                  <td className="px-3 py-2">{fmt(e.lastSuccessfulAt)}</td>
                  <td className="px-3 py-2">
                    {e.lastRun?.durationMs != null ? `${e.lastRun.durationMs} ms` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {e.lastRun ? `${e.lastRun.inserted} / ${e.lastRun.updated}` : "—"}
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate text-red-700" title={e.lastRun?.error ?? ""}>
                    {e.lastRun?.error ?? ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="rounded border px-2 py-1 text-xs"
                      onClick={() => runOne(e.entity)}
                      disabled={busy !== null}
                    >
                      {busy === e.entity ? "…" : "Sync"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
