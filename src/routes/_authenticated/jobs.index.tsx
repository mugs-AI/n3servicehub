/**
 * Milestone 1.5 — Jobs Workspace: Jobs List.
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
  my_open: "My Open Jobs",
  all_open: "All Open Jobs",
  all: "All Jobs",
  draft_approval: "Draft / Waiting Approval",
  pending: "Pending",
  assigned: "Assigned",
  in_progress: "In Progress",
  waiting_customer: "Waiting Customer",
  waiting_vendor: "Waiting Vendor",
  high_priority: "High Priority",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-zinc-200 text-zinc-800",
  pending: "bg-amber-100 text-amber-800",
  assigned: "bg-blue-100 text-blue-800",
  in_progress: "bg-indigo-100 text-indigo-800",
  waiting_customer: "bg-orange-100 text-orange-800",
  waiting_vendor: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-zinc-200 text-zinc-500",
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-zinc-100 text-zinc-700",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-red-100 text-red-800",
};

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

  if (!tenants.data) return <div className="p-6 text-sm">Loading tenants…</div>;
  if (!tenantId) {
    return (
      <div className="p-6 text-sm">
        You do not belong to any tenant.{" "}
        <Link to="/support" className="underline">
          Back to Support
        </Link>
      </div>
    );
  }

  const canViewAll = jobs.data?.canViewAll ?? false;
  const label = jobs.data?.assignedUserLabel ?? "Engineer";
  const availableViews = Object.keys(VIEW_LABEL).filter((v) => {
    if ((v === "all_open" || v === "all") && !canViewAll) return false;
    return true;
  });

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Jobs</h1>
          <p className="text-xs text-muted-foreground">
            Tenant: <span className="font-mono">{active?.tenantName}</span> · Role:{" "}
            {active?.profile}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={defaultView}
            onValueChange={(v) =>
              navigate({ to: "/jobs", search: { tenant: tenantId, view: v, q: search || undefined } })
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableViews.map((v) => (
                <SelectItem key={v} value={v}>
                  {VIEW_LABEL[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job/customer/subject/vendor/ticket"
            className="w-72"
          />
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Job No</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">{label}</th>
                  <th className="px-3 py-2">Created By</th>
                  <th className="px-3 py-2">Approval</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Ticket</th>
                  <th className="px-3 py-2">Due</th>
                </tr>
              </thead>
              <tbody>
                {jobs.isLoading && (
                  <tr>
                    <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {jobs.error && (
                  <tr>
                    <td colSpan={12} className="px-3 py-6 text-center text-destructive">
                      {(jobs.error as Error).message}
                    </td>
                  </tr>
                )}
                {jobs.data?.rows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">
                      No jobs match this view.
                    </td>
                  </tr>
                )}
                {jobs.data?.rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono">
                      <Link
                        to="/jobs/$jobId"
                        params={{ jobId: r.id }}
                        search={{ tenant: tenantId }}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {r.jobNo}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.customerName ?? "—"}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.customerCode}</div>
                    </td>
                    <td className="px-3 py-2 max-w-[280px] truncate">{r.subject}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={STATUS_COLOR[r.status] ?? ""}>
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={PRIORITY_COLOR[r.priority] ?? ""}>
                        {r.priority}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{r.assignedUser ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                    <td className="px-3 py-2">{r.createdBy ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.approvalRequired ? r.approvalStatus.replace(/_/g, " ") : "—"}
                    </td>
                    <td className="px-3 py-2">{r.vendorName ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.vendorTicketNumber ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.dueDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {jobs.data && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing {jobs.data.rows.length} of {jobs.data.total} jobs.
        </p>
      )}
    </main>
  );
}
