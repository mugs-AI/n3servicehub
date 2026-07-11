/**
 * Milestone 1.4 — Support Dashboard + Customer Service Console.
 * Desktop-first, responsive. Server-side permission-checked.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getMyTenants,
  searchCustomers,
  getCustomerSummary,
  listCustomerJobs,
  getSupportDashboardCounts,
  type CustomerSearchResult,
} from "@/lib/support.functions";
import { CustomerSummaryCard } from "@/components/servicehub/CustomerSummaryCard";
import { ContractStatusBadge } from "@/components/servicehub/ContractStatusBadge";

export const Route = createFileRoute("/_authenticated/support")({
  component: SupportDashboard,
  errorComponent: ({ error }) => (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Support dashboard error</h1>
      <p className="mt-2 text-sm text-destructive">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-8">Not found.</div>,
});

function SupportDashboard() {
  const tenantsFn = useServerFn(getMyTenants);
  const tenants = useQuery({ queryKey: ["my-tenants"], queryFn: () => tenantsFn() });

  const [tenantId, setTenantId] = useState<string>("");
  useEffect(() => {
    if (!tenantId && tenants.data && tenants.data.length > 0) {
      setTenantId(tenants.data[0].tenantId);
    }
  }, [tenants.data, tenantId]);

  if (tenants.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!tenants.data || tenants.data.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">Support Dashboard</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          You are not linked to any ServiceHub tenant. Please contact your Administrator.
        </p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Search a Customer, view contract status, and create a Job.
          </p>
        </div>
        {tenants.data.length > 1 && (
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tenants.data.map((t) => (
                <SelectItem key={t.tenantId} value={t.tenantId}>
                  {t.tenantName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </header>

      {tenantId && <SupportBody tenantId={tenantId} />}
    </main>
  );
}

function SupportBody({ tenantId }: { tenantId: string }) {
  const countsFn = useServerFn(getSupportDashboardCounts);
  const counts = useQuery({
    queryKey: ["support-counts", tenantId],
    queryFn: () => countsFn({ data: { tenantId } }),
  });

  return (
    <div className="mt-6 space-y-6">
      <CustomerServiceConsole tenantId={tenantId} />
      <OperationalCards
        tenantId={tenantId}
        loading={counts.isLoading}
        counts={counts.data}
        error={counts.error as Error | null}
      />
    </div>
  );
}

// -------------------- Console --------------------

function CustomerServiceConsole({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const searchFn = useServerFn(searchCustomers);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(h);
  }, [term]);

  const shouldSearch = debounced.length >= 2 && !selected;
  const results = useQuery({
    queryKey: ["customer-search", tenantId, debounced],
    queryFn: () => searchFn({ data: { tenantId, query: debounced } }),
    enabled: shouldSearch,
  });

  const goStandard = () => {
    if (!selected) return;
    navigate({ to: "/jobs/new", search: { tenant: tenantId, customer: selected.code ?? "" } });
  };
  const goQuick = () => {
    if (!selected) return;
    navigate({ to: "/jobs/quick", search: { tenant: tenantId, customer: selected.code ?? "" } });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Service Console</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            className="min-w-[280px] flex-1"
            placeholder="Search by code, name, phone, contact person, or email…"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setSelected(null);
            }}
          />
          <Button onClick={goStandard} disabled={!selected}>
            Standard Job
          </Button>
          <Button variant="outline" onClick={goQuick} disabled={!selected}>
            Quick Job
          </Button>
        </div>

        {!selected && shouldSearch && (
          <SearchResults
            loading={results.isLoading}
            error={results.error as Error | null}
            rows={results.data ?? []}
            onSelect={setSelected}
          />
        )}

        {!selected && !shouldSearch && (
          <p className="text-xs text-muted-foreground">
            Type at least 2 characters to search Customers.
          </p>
        )}

        {selected && selected.code && (
          <SelectedCustomer
            tenantId={tenantId}
            customerCode={selected.code}
            onClear={() => {
              setSelected(null);
              setTerm("");
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SearchResults({
  loading,
  error,
  rows,
  onSelect,
}: {
  loading: boolean;
  error: Error | null;
  rows: CustomerSearchResult[];
  onSelect: (r: CustomerSearchResult) => void;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Searching…</p>;
  if (error)
    return (
      <p className="text-sm text-destructive">
        Search failed: {error.message}
      </p>
    );
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No Customers matched.</p>;
  return (
    <div className="max-h-80 overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Contract</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.n3RecordId}>
              <TableCell className="font-mono">{r.code ?? "—"}</TableCell>
              <TableCell>{r.name ?? "—"}</TableCell>
              <TableCell>{r.phone ?? "—"}</TableCell>
              <TableCell>{r.contactPerson ?? "—"}</TableCell>
              <TableCell>
                <ContractStatusBadge status={r.contractStatus} />
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!r.code}
                  onClick={() => onSelect(r)}
                >
                  Select
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SelectedCustomer({
  tenantId,
  customerCode,
  onClear,
}: {
  tenantId: string;
  customerCode: string;
  onClear: () => void;
}) {
  const summaryFn = useServerFn(getCustomerSummary);
  const historyFn = useServerFn(listCustomerJobs);
  const summary = useQuery({
    queryKey: ["customer-summary", tenantId, customerCode],
    queryFn: () => summaryFn({ data: { tenantId, customerCode } }),
  });
  const history = useQuery({
    queryKey: ["customer-history", tenantId, customerCode],
    queryFn: () => historyFn({ data: { tenantId, customerCode, limit: 10 } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Selected customer <span className="font-mono">{customerCode}</span>
        </p>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Change Customer
        </Button>
      </div>

      {summary.isLoading && (
        <p className="text-sm text-muted-foreground">Loading summary…</p>
      )}
      {summary.error && (
        <p className="text-sm text-destructive">
          {(summary.error as Error).message}
        </p>
      )}
      {summary.data && <CustomerSummaryCard summary={summary.data} />}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Customer Job History (latest 10)</CardTitle>
          <Button size="sm" variant="outline" disabled>
            View All Jobs
          </Button>
        </CardHeader>
        <CardContent>
          {history.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {history.error && (
            <p className="text-sm text-destructive">
              {(history.error as Error).message}
            </p>
          )}
          {history.data && history.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No ServiceHub Jobs have been recorded for this Customer.
            </p>
          )}
          {history.data && history.data.length > 0 && (
            <div className="overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job No</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Engineer</TableHead>
                    <TableHead>PIC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.data.map((r) => (
                    <TableRow key={r.jobNo}>
                      <TableCell className="font-mono">{r.jobNo}</TableCell>
                      <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                      <TableCell>{r.subject}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.status}</Badge>
                      </TableCell>
                      <TableCell>{r.priority}</TableCell>
                      <TableCell>{r.assignedEngineer ?? "—"}</TableCell>
                      <TableCell>{r.createdBy ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------- Operational Cards --------------------

function OperationalCards({
  tenantId: _tenantId,
  loading,
  counts,
  error,
}: {
  tenantId: string;
  loading: boolean;
  counts:
    | Awaited<ReturnType<typeof getSupportDashboardCounts>>
    | undefined;
  error: Error | null;
}) {
  const items = useMemo(
    () => [
      { label: "Today's Jobs", value: counts?.todayJobs ?? 0, jobs: true },
      { label: "High Priority Jobs", value: counts?.highPriority ?? 0, jobs: true },
      { label: "Draft / Waiting Approval", value: counts?.draftOrPending ?? 0, jobs: true },
      { label: "Waiting Customer", value: counts?.waitingCustomer ?? 0, jobs: true },
      { label: "Waiting Vendor", value: counts?.waitingVendor ?? 0, jobs: true },
      { label: "Due Soon Customers", value: counts?.dueSoonCustomers ?? 0, jobs: false },
      { label: "Overdue Customers", value: counts?.overdueCustomers ?? 0, jobs: false },
    ],
    [counts],
  );

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Operational Overview
      </h2>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((it) => (
          <Card key={it.label}>
            <CardContent className="pt-6">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {it.label}
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {loading ? "…" : it.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
