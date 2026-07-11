/**
 * Admin verification console for the N3 synchronization layer +
 * Customer Contract Status Engine (Milestone 1.3).
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
import {
  getContractStatusSummary,
  listContractSnapshots,
  recalculateContractStatus,
  getContractParsingDiagnostics,
  type ContractStatusSummary,
  type ContractSnapshotRow,
  type ParsingDiagnosticRow,
} from "@/lib/contract-status.functions";

export const Route = createFileRoute("/_authenticated/admin/dev/sync")({
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
  const fetchContractSummary = useServerFn(getContractStatusSummary);
  const fetchContractSnapshots = useServerFn(listContractSnapshots);
  const runRecalc = useServerFn(recalculateContractStatus);
  const fetchDiagnostics = useServerFn(getContractParsingDiagnostics);

  const [tenants, setTenants] = useState<Array<{ tenantId: string; name: string }>>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [report, setReport] = useState<SyncStatusReport | null>(null);
  const [contractSummary, setContractSummary] = useState<ContractStatusSummary | null>(null);
  const [snapshots, setSnapshots] = useState<ContractSnapshotRow[]>([]);
  const [diagnostics, setDiagnostics] = useState<ParsingDiagnosticRow[] | null>(null);
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
      const [r, cs, snaps] = await Promise.all([
        fetchStatus({ data: { tenantId: id } }),
        fetchContractSummary({ data: { tenantId: id } }),
        fetchContractSnapshots({ data: { tenantId: id, limit: 100 } }),
      ]);
      setReport(r);
      setContractSummary(cs);
      setSnapshots(snaps);
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

  const runContractRecalc = async () => {
    if (!tenantId) return;
    setBusy("__recalc__");
    setErr(null);
    try {
      await runRecalc({ data: { tenantId } });
      await refresh(tenantId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const runDiagnostics = async () => {
    if (!tenantId) return;
    setBusy("__diag__");
    setErr(null);
    try {
      const rows = await fetchDiagnostics({ data: { tenantId, limit: 100 } });
      setDiagnostics(rows);
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

      {contractSummary && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Customer Contract Status</h2>
              <p className="text-sm text-gray-600">
                Latest qualifying renewal document per customer. Auto-recalculated
                after Sales Invoice or Delivery Order sync.
              </p>
            </div>
            <button
              className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
              onClick={runContractRecalc}
              disabled={!tenantId || busy !== null}
            >
              {busy === "__recalc__" ? "Recalculating…" : "Recalculate now"}
            </button>
          </div>

          {contractSummary.configError && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              <strong>Configuration error:</strong> {contractSummary.configError} Snapshots are
              kept stale until this is fixed. Open{" "}
              <a className="underline" href="/settings">Settings → General</a> to configure Due
              Soon days.
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <StatCard label="Customers" value={contractSummary.totalCustomers} />
            <StatCard label="Snapshots" value={contractSummary.snapshotCount} />
            <StatCard label="Active" value={contractSummary.counts.active} tone="green" />
            <StatCard label="Due soon" value={contractSummary.counts.due_soon} tone="amber" />
            <StatCard label="Overdue" value={contractSummary.counts.overdue} tone="red" />
            <StatCard label="Unknown" value={contractSummary.counts.unknown} />
            <StatCard label="Failed" value={contractSummary.failedCount} tone={contractSummary.failedCount > 0 ? "red" : undefined} />
          </div>
          <p className="mb-4 text-xs text-gray-500">
            Last calculation: {fmt(contractSummary.lastCalculatedAt)}
            {contractSummary.staleCount > 0 && (
              <span className="ml-2 text-amber-700">
                · {contractSummary.staleCount} snapshot(s) marked stale
              </span>
            )}
          </p>

          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Latest doc</th>
                  <th className="px-3 py-2">Doc date</th>
                  <th className="px-3 py-2">Stock code</th>
                  <th className="px-3 py-2">Contract days</th>
                  <th className="px-3 py-2">Expiry</th>
                  <th className="px-3 py-2">Remaining</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-4 text-center text-gray-500">
                      No snapshots yet. Run "Recalculate now" or sync Sales Invoices / Delivery Orders.
                    </td>
                  </tr>
                )}
                {snapshots.map((s) => (
                  <tr key={s.customerCode} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{s.customerName ?? s.customerCode}</div>
                      <div className="text-xs text-gray-500">{s.customerCode}</div>
                    </td>
                    <td className="px-3 py-2">{s.source ?? "—"}</td>
                    <td className="px-3 py-2">{s.documentNo ?? "—"}</td>
                    <td className="px-3 py-2">{s.documentDate ?? "—"}</td>
                    <td className="px-3 py-2">{s.stockCode ?? "—"}</td>
                    <td className="px-3 py-2">{s.contractDays ?? "—"}</td>
                    <td className="px-3 py-2">{s.expiryDate ?? "—"}</td>
                    <td className="px-3 py-2">{s.remainingDays ?? "—"}</td>
                    <td className="px-3 py-2">
                      <ContractStatusBadge status={s.status} />
                      {s.isStale && (
                        <span className="ml-2 text-xs text-amber-700">stale</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Document Parsing Diagnostics</h3>
              <button
                className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                onClick={runDiagnostics}
                disabled={!tenantId || busy !== null}
              >
                {busy === "__diag__" ? "Scanning…" : "Scan payloads"}
              </button>
            </div>
            <p className="mb-2 text-xs text-gray-500">
              Lists synced Sales Invoices / Delivery Orders where no line collection or Stock
              Code field was found. No pricing or raw payload is exposed.
            </p>
            {diagnostics && diagnostics.length === 0 && (
              <p className="text-sm text-green-700">No parsing issues found.</p>
            )}
            {diagnostics && diagnostics.length > 0 && (
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2">Doc No</th>
                      <th className="px-3 py-2">Doc Date</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Lines</th>
                      <th className="px-3 py-2">Missing</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2">Doc ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostics.map((d) => (
                      <tr key={`${d.source}:${d.docId}`} className="border-t">
                        <td className="px-3 py-2">{d.source}</td>
                        <td className="px-3 py-2">{d.docNo ?? "—"}</td>
                        <td className="px-3 py-2">{d.docDate ?? "—"}</td>
                        <td className="px-3 py-2">{d.customerCode ?? "—"}</td>
                        <td className="px-3 py-2">{d.lineCount}</td>
                        <td className="px-3 py-2">{d.missingStockCount}</td>
                        <td className="px-3 py-2 text-red-700">{d.reason}</td>
                        <td className="px-3 py-2 font-mono text-xs">{d.docId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber" | "red";
}) {
  const toneCls =
    tone === "green"
      ? "text-green-800 bg-green-50 border-green-200"
      : tone === "amber"
        ? "text-amber-800 bg-amber-50 border-amber-200"
        : tone === "red"
          ? "text-red-800 bg-red-50 border-red-200"
          : "text-gray-800 bg-gray-50 border-gray-200";
  return (
    <div className={`rounded border px-3 py-2 ${toneCls}`}>
      <div className="text-xs uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}

function ContractStatusBadge({ status }: { status: ContractSnapshotRow["status"] }) {
  const cls =
    status === "active"
      ? "bg-green-100 text-green-800"
      : status === "due_soon"
        ? "bg-amber-100 text-amber-800"
        : status === "overdue"
          ? "bg-red-100 text-red-800"
          : status === "suspended"
            ? "bg-purple-100 text-purple-800"
            : "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
