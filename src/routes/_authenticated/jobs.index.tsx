/**
 * Milestone 1.5 — Jobs Workspace: Jobs List.
 * Milestone 1.5.1 — UI polish only. No business logic changes.
 * Default view is "My Open Jobs" for non-admins; admin defaults to "All Open".
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMyTenants } from "@/lib/support.functions";
import { listJobs, type JobsListFilters } from "@/lib/jobs-workspace.functions";
import {
  StatusBadge,
  PriorityBadge,
  Avatar,
} from "@/components/servicehub/JobBadges";
import { cn } from "@/lib/utils";
import { Plus, Zap, Search, Inbox, AlertCircle, Loader2 } from "lucide-react";

const searchSchema = z.object({
  tenant: z.string().uuid().optional(),
  view: z.string().optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/jobs/")({
  validateSearch: (s) => searchSchema.parse(s),
  component: JobsListPage,
});

const VIEW_LABEL: Record<string, string> = {
  my_open: "My Open",
  all_open: "All Open",
  draft_approval: "Draft / Approval",
  pending: "Pending",
  in_progress: "In Progress",
  waiting_customer: "Waiting Customer",
  waiting_vendor: "Waiting Vendor",
  high_priority: "High Priority",
  completed: "Completed",
  cancelled: "Cancelled",
  all: "All Jobs",
};

const PRESET_ORDER = [
  "my_open",
  "all_open",
  "draft_approval",
  "pending",
  "in_progress",
  "waiting_customer",
  "waiting_vendor",
  "high_priority",
  "completed",
  "all",
];

function JobsListPage() {
  const { tenant, view, q } = Route.useSearch();
  const navigate = useNavigate();
  const tenantsFn = useServerFn(getMyTenants);
  const tenants = useQuery({ queryKey: ["my-tenants"], queryFn: () => tenantsFn() });
  const active = tenants.data?.find((t) => t.tenantId === tenant) ?? tenants.data?.[0];
  const tenantId = active?.tenantId ?? "";
  const isAdmin = active?.profile === "administrator";
  const defaultView = view ?? (isAdmin ? "all_open" : "my_open");
  const [search, setSearch] = useState(q ?? "");

  const listFn = useServerFn(listJobs);
  const filters = useMemo<JobsListFilters>(
    () => ({ view: defaultView as JobsListFilters["view"], search }),
    [defaultView, search],
  );
  const jobs = useQuery({
    queryKey: ["jobs-list", tenantId, filters],
    queryFn: () => listFn({ data: { tenantId, filters } }),
    enabled: !!tenantId,
  });

  if (!tenants.data)
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading tenants…
      </div>
    );
  if (!tenantId) {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-sm">
        <p className="mb-3 text-muted-foreground">You do not belong to any tenant.</p>
        <Button asChild variant="outline">
          <Link to="/support">Back to Support</Link>
        </Button>
      </div>
    );
  }

  const canViewAll = jobs.data?.canViewAll ?? false;
  const label = jobs.data?.assignedUserLabel ?? "Engineer";
  const presets = PRESET_ORDER.filter((v) => {
    if ((v === "all_open" || v === "all") && !canViewAll) return false;
    return true;
  });

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      {/* Header */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Jobs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage service requests, follow-ups and assigned work.
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            Tenant: <span className="font-mono">{active?.tenantName}</span>
            <span className="mx-1">·</span>Role: {active?.profile}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/jobs/quick" search={{ tenant: tenantId }}>
              <Zap className="h-4 w-4" /> Quick Job
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/jobs/new" search={{ tenant: tenantId }}>
              <Plus className="h-4 w-4" /> New Job
            </Link>
          </Button>
        </div>
      </header>

      {/* Presets + Search */}
      <div className="space-y-3">
        {/* Mobile: single select */}
        <div className="md:hidden">
          <Select
            value={defaultView}
            onValueChange={(v) =>
              navigate({
                to: "/jobs",
                search: { tenant: tenantId, view: v, q: search || undefined },
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {presets.map((v) => (
                <SelectItem key={v} value={v}>
                  {VIEW_LABEL[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Desktop: segmented tabs */}
        <div className="hidden overflow-x-auto md:block">
          <div className="inline-flex rounded-lg border bg-muted/40 p-1">
            {presets.map((v) => {
              const activeTab = v === defaultView;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/jobs",
                      search: { tenant: tenantId, view: v, q: search || undefined },
                    })
                  }
                  className={cn(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    activeTab
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {VIEW_LABEL[v]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job number, customer, subject, vendor or ticket…"
            className="pl-9"
            aria-label="Search jobs"
          />
        </div>
      </div>

      {/* Results */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {jobs.isLoading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading jobs…
            </div>
          )}
          {jobs.error && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {(jobs.error as Error).message}
            </div>
          )}
          {jobs.data && jobs.data.rows.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
              </div>
              <p className="text-sm font-medium">No jobs found</p>
              <p className="text-xs text-muted-foreground">
                No jobs match this view or search.
              </p>
            </div>
          )}

          {jobs.data && jobs.data.rows.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5">Job No</th>
                      <th className="px-4 py-2.5">Customer</th>
                      <th className="px-4 py-2.5">Subject</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Priority</th>
                      <th className="px-4 py-2.5">{label}</th>
                      <th className="px-4 py-2.5 hidden lg:table-cell">Vendor / Ticket</th>
                      <th className="px-4 py-2.5">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {jobs.data.rows.map((r) => (
                      <tr
                        key={r.id}
                        className="transition-colors hover:bg-muted/40"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link
                            to="/jobs/$jobId"
                            params={{ jobId: r.id }}
                            search={{ tenant: tenantId }}
                            className="font-mono text-sm font-medium text-primary hover:underline"
                          >
                            {r.jobNo}
                          </Link>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="max-w-[220px] truncate font-medium">
                            {r.customerName ?? "—"}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {r.customerCode}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[280px]">
                          <div className="truncate">{r.subject}</div>
                          {r.approvalRequired && (
                            <div className="mt-0.5 text-[10px] font-medium text-amber-700">
                              Approval: {r.approvalStatus.replace(/_/g, " ")}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-3">
                          <PriorityBadge priority={r.priority} />
                        </td>
                        <td className="px-4 py-3">
                          {r.assignedUser ? (
                            <div className="flex items-center gap-2">
                              <Avatar name={r.assignedUser} />
                              <span className="truncate">{r.assignedUser}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 lg:table-cell">
                          {r.vendorName || r.vendorTicketNumber ? (
                            <>
                              <div className="truncate">{r.vendorName ?? "—"}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {r.vendorTicketNumber ?? ""}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                          {r.dueDate ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile stacked cards */}
              <ul className="divide-y md:hidden">
                {jobs.data.rows.map((r) => (
                  <li key={r.id} className="p-4">
                    <Link
                      to="/jobs/$jobId"
                      params={{ jobId: r.id }}
                      search={{ tenant: tenantId }}
                      className="block space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-sm font-semibold text-primary">
                            {r.jobNo}
                          </div>
                          <div className="mt-0.5 truncate text-sm font-medium">
                            {r.subject}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {r.customerName ?? r.customerCode ?? "—"}
                          </div>
                        </div>
                        <PriorityBadge priority={r.priority} />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={r.status} />
                        {r.approvalRequired && (
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 text-amber-800"
                          >
                            {r.approvalStatus.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="truncate">
                          {r.assignedUser ?? "Unassigned"}
                        </span>
                        <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {jobs.data && jobs.data.rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {jobs.data.rows.length} of {jobs.data.total} jobs.
        </p>
      )}
    </main>
  );
}
