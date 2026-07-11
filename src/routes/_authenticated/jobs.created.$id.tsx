/**
 * Milestone 1.4 — Job Created success + simple read-only view.
 */

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getJobDetail } from "@/lib/jobs.functions";
import { getMyTenants } from "@/lib/support.functions";

const searchSchema = z.object({
  tenant: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/jobs/created/$id")({
  validateSearch: (s) => searchSchema.parse(s),
  component: CreatedJob,
});

function CreatedJob() {
  const { id } = Route.useParams();
  const { tenant } = Route.useSearch();
  const navigate = useNavigate();

  const tenantsFn = useServerFn(getMyTenants);
  const jobFn = useServerFn(getJobDetail);
  const tenants = useQuery({ queryKey: ["my-tenants"], queryFn: () => tenantsFn() });
  const tenantId = tenant ?? tenants.data?.[0]?.tenantId ?? "";

  const job = useQuery({
    queryKey: ["job", tenantId, id],
    queryFn: () => jobFn({ data: { tenantId, jobId: id } }),
    enabled: !!tenantId,
  });

  if (!tenantId || job.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (job.error) {
    return <div className="p-8 text-sm text-destructive">{(job.error as Error).message}</div>;
  }
  if (!job.data) return null;
  const j = job.data;
  const isDraft = j.status === "draft" || j.approvalStatus === "waiting_approval";

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-4 rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-900">
        Job created successfully.
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">Job {j.jobNo}</CardTitle>
            <p className="text-sm text-muted-foreground">{j.title}</p>
          </div>
          <Badge variant="outline">{j.entryMode ?? "standard"}</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Customer" value={`${j.customerName ?? "—"} (${j.customerCode ?? "—"})`} />
          <Row label="Workflow Status" value={j.status} />
          <Row
            label="Approval Status"
            value={
              j.approvalRequired
                ? j.approvalStatus === "waiting_approval"
                  ? "Waiting for Administrator approval"
                  : j.approvalStatus
                : "Not required"
            }
          />
          <Row label="Priority" value={j.priority} />
          <Row label="Assigned Engineer" value={j.assignedEngineer ?? "Unassigned"} />
          <Row label="Created By / PIC" value={j.createdBy ?? "—"} />
          <Row label="Contract Status at Creation" value={j.contractStatusAtCreation ?? "—"} />
          {j.description && <Row label="Description" value={j.description} />}
          {isDraft && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Waiting for Administrator approval.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link to="/support">Return to Customer Console</Link>
        </Button>
        <Button
          onClick={() =>
            navigate({
              to: "/jobs/new",
              search: { tenant: tenantId, customer: j.customerCode ?? "" },
            })
          }
        >
          Create Another Job
        </Button>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-border/50 py-2 last:border-b-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="col-span-2">{value}</div>
    </div>
  );
}
