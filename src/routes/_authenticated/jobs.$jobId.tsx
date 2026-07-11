/**
 * Milestone 1.5 — Job Detail & workflow.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listEngineerOptions } from "@/lib/support.functions";
import {
  getJobFull,
  listJobComments,
  addJobComment,
  listJobAttachments,
  addJobAttachment,
  signAttachment,
  updateJobInfo,
  reassignJob,
  startJob,
  markWaitingCustomer,
  updateVendorReferral,
  markWaitingVendor,
  resumeJob,
  approveJob,
  rejectJob,
  completeJob,
  cancelJob,
  listJobActivity,
} from "@/lib/jobs-workspace.functions";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({ tenant: z.string().uuid() });

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: JobDetailPage,
});

function JobDetailPage() {
  const { jobId } = Route.useParams();
  const { tenant } = Route.useSearch();
  const qc = useQueryClient();
  const getJob = useServerFn(getJobFull);
  const engineersFn = useServerFn(listEngineerOptions);

  const job = useQuery({
    queryKey: ["job", tenant, jobId],
    queryFn: () => getJob({ data: { tenantId: tenant, jobId } }),
  });
  const engineers = useQuery({
    queryKey: ["engineers", tenant],
    queryFn: () => engineersFn({ data: { tenantId: tenant } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["job", tenant, jobId] });
    qc.invalidateQueries({ queryKey: ["job-activity", tenant, jobId] });
  };

  if (job.isLoading) return <div className="p-6 text-sm">Loading…</div>;
  if (job.error)
    return (
      <div className="p-6 text-sm text-destructive">
        {(job.error as Error).message}{" "}
        <Link to="/jobs" search={{ tenant }} className="underline">
          Back
        </Link>
      </div>
    );
  const j = job.data!;

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link to="/jobs" search={{ tenant }} className="underline">
              Jobs
            </Link>{" "}
            /
          </div>
          <h1 className="text-2xl font-semibold font-mono">{j.job_no}</h1>
          <p className="text-sm text-muted-foreground">{j.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Status: {j.status.replace(/_/g, " ")}</Badge>
          <Badge variant="outline">Priority: {j.priority}</Badge>
          {j.approval_required && (
            <Badge variant="outline">
              Approval: {j.approval_status.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="text-sm grid grid-cols-2 gap-3">
              <Field label="Customer" value={j.n3_customer_name ?? j.n3_customer_code ?? "—"} />
              <Field label={j.assignedUserLabel} value={j.assigned_engineer_display_name ?? "Unassigned"} />
              <Field label="Created By" value={j.created_by_display_name ?? "—"} />
              <Field label="Due Date" value={j.due_date ?? "—"} />
              <Field label="Contract at Creation" value={j.contract_status_at_creation ?? "—"} />
              <Field
                label="Contract Now"
                value={
                  j.contractStatusCurrent
                    ? `${j.contractStatusCurrent}${j.contractExpiryCurrent ? ` (expires ${j.contractExpiryCurrent})` : ""}`
                    : "—"
                }
              />
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">Description</div>
                <div className="whitespace-pre-wrap">{j.description ?? "—"}</div>
              </div>
              {j.internal_remark && (
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground">Internal Remark</div>
                  <div className="whitespace-pre-wrap">{j.internal_remark}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="comments">
            <TabsList>
              <TabsTrigger value="comments">Comments</TabsTrigger>
              <TabsTrigger value="attachments">Attachments</TabsTrigger>
              {j.viewerCanViewActivity && <TabsTrigger value="activity">Activity</TabsTrigger>}
              {j.vendor_referral_required && <TabsTrigger value="vendor">Vendor</TabsTrigger>}
              {j.status === "waiting_customer" && (
                <TabsTrigger value="waiting_customer">Waiting Customer</TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="comments">
              <CommentsPanel tenantId={tenant} jobId={jobId} onChanged={invalidate} />
            </TabsContent>
            <TabsContent value="attachments">
              <AttachmentsPanel tenantId={tenant} jobId={jobId} onChanged={invalidate} />
            </TabsContent>
            {j.viewerCanViewActivity && (
              <TabsContent value="activity">
                <ActivityPanel tenantId={tenant} jobId={jobId} />
              </TabsContent>
            )}
            {j.vendor_referral_required && (
              <TabsContent value="vendor">
                <VendorPanel job={j} onChanged={invalidate} />
              </TabsContent>
            )}
            {j.status === "waiting_customer" && (
              <TabsContent value="waiting_customer">
                <WaitingCustomerPanel job={j} />
              </TabsContent>
            )}
          </Tabs>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ActionsPanel
                job={j}
                engineers={engineers.data ?? []}
                onChanged={invalidate}
              />
            </CardContent>
          </Card>
          {j.viewerCanAct && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Edit Info</CardTitle>
              </CardHeader>
              <CardContent>
                <EditInfoPanel job={j} onChanged={invalidate} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

// ---------- Comments ----------
function CommentsPanel({
  tenantId,
  jobId,
  onChanged,
}: {
  tenantId: string;
  jobId: string;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listJobComments);
  const addFn = useServerFn(addJobComment);
  const list = useQuery({
    queryKey: ["job-comments", tenantId, jobId],
    queryFn: () => listFn({ data: { tenantId, jobId } }),
  });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {list.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        )}
        {list.data?.map((c) => (
          <div key={c.id} className="rounded border p-2 text-sm">
            <div className="text-xs text-muted-foreground">
              {c.authorName ?? "Unknown"} · {new Date(c.createdAt).toLocaleString()}
            </div>
            <div className="whitespace-pre-wrap">{c.body}</div>
          </div>
        ))}
      </div>
      <div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Add a comment…" />
        <Button
          className="mt-2"
          disabled={busy || !body.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await addFn({ data: { tenantId, jobId, body } });
              setBody("");
              qc.invalidateQueries({ queryKey: ["job-comments", tenantId, jobId] });
              onChanged();
            } finally {
              setBusy(false);
            }
          }}
        >
          Add Comment
        </Button>
      </div>
    </div>
  );
}

// ---------- Attachments ----------
function AttachmentsPanel({
  tenantId,
  jobId,
  onChanged,
}: {
  tenantId: string;
  jobId: string;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listJobAttachments);
  const addFn = useServerFn(addJobAttachment);
  const signFn = useServerFn(signAttachment);
  const list = useQuery({
    queryKey: ["job-attachments", tenantId, jobId],
    queryFn: () => listFn({ data: { tenantId, jobId } }),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(f: File) {
    setBusy(true);
    setErr(null);
    try {
      const path = `${tenantId}/${jobId}/${Date.now()}-${f.name}`;
      const { error } = await supabase.storage.from("job-attachments").upload(path, f);
      if (error) throw error;
      await addFn({ data: { tenantId, jobId, storagePath: path, fileName: f.name } });
      qc.invalidateQueries({ queryKey: ["job-attachments", tenantId, jobId] });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Input
        type="file"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="space-y-1">
        {list.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No attachments.</p>
        )}
        {list.data?.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded border p-2 text-sm">
            <div>
              <div>{a.fileName}</div>
              <div className="text-xs text-muted-foreground">
                {a.uploadedByName ?? "—"} · {new Date(a.createdAt).toLocaleString()}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const { url } = await signFn({ data: { tenantId, storagePath: a.storagePath } });
                window.open(url, "_blank");
              }}
            >
              Open
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Activity ----------
function ActivityPanel({ tenantId, jobId }: { tenantId: string; jobId: string }) {
  const listFn = useServerFn(listJobActivity);
  const list = useQuery({
    queryKey: ["job-activity", tenantId, jobId],
    queryFn: () => listFn({ data: { tenantId, jobId } }),
  });
  return (
    <div className="space-y-1">
      {list.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      )}
      {list.data?.map((a) => (
        <div key={a.id} className="rounded border p-2 text-xs">
          <div className="font-medium">{a.action.replace(/_/g, " ")}</div>
          <div className="text-muted-foreground">
            {a.userCode ?? "system"} · {new Date(a.createdAt).toLocaleString()}
          </div>
          {(a.before || a.after) && (
            <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
              {JSON.stringify({ before: a.before, after: a.after }, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- Actions ----------
function ActionsPanel({
  job,
  engineers,
  onChanged,
}: {
  job: any;
  engineers: { id: string; displayName: string; source: string }[];
  onChanged: () => void;
}) {
  const startFn = useServerFn(startJob);
  const resumeFn = useServerFn(resumeJob);
  const reassignFn = useServerFn(reassignJob);
  const wcFn = useServerFn(markWaitingCustomer);
  const wvFn = useServerFn(markWaitingVendor);
  const approveFn = useServerFn(approveJob);
  const rejectFn = useServerFn(rejectJob);
  const completeFn = useServerFn(completeJob);
  const cancelFn = useServerFn(cancelJob);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const canStart =
    job.viewerCanAct &&
    ["pending", "assigned"].includes(job.status) &&
    (!job.approval_required || job.approval_status === "approved");
  const canResume = job.viewerCanAct && ["waiting_customer", "waiting_vendor"].includes(job.status);
  const isClosed = ["completed", "cancelled"].includes(job.status);

  return (
    <div className="space-y-2">
      {err && <p className="text-sm text-destructive">{err}</p>}

      {job.approval_required && job.approval_status === "waiting_approval" && job.viewerCanApprove && (
        <div className="rounded border p-2 space-y-2">
          <div className="text-xs font-medium">Approval required</div>
          <ApproveDialog
            onApprove={(t, note) =>
              run("approve", () =>
                approveFn({
                  data: {
                    tenantId: job.tenant_id,
                    jobId: job.id,
                    approvalType: t,
                    note,
                  },
                }),
              )
            }
          />
          <RejectDialog
            onReject={(reason, then) =>
              run("reject", () =>
                rejectFn({
                  data: { tenantId: job.tenant_id, jobId: job.id, reason, then },
                }),
              )
            }
          />
        </div>
      )}

      {canStart && (
        <Button
          size="sm"
          className="w-full"
          disabled={busy !== null}
          onClick={() =>
            run("start", () => startFn({ data: { tenantId: job.tenant_id, jobId: job.id } }))
          }
        >
          Start Job
        </Button>
      )}
      {canResume && (
        <Button
          size="sm"
          className="w-full"
          variant="secondary"
          disabled={busy !== null}
          onClick={() =>
            run("resume", () =>
              resumeFn({
                data: {
                  tenantId: job.tenant_id,
                  jobId: job.id,
                  from: job.status === "waiting_vendor" ? "vendor" : "customer",
                },
              }),
            )
          }
        >
          Resume
        </Button>
      )}
      {job.viewerCanAct && !isClosed && (
        <>
          <ReassignDialog
            job={job}
            engineers={engineers}
            onSubmit={(assigneeId, reason) =>
              run("reassign", () =>
                reassignFn({
                  data: { tenantId: job.tenant_id, jobId: job.id, assigneeId, reason },
                }),
              )
            }
          />
          <WaitingCustomerDialog
            onSubmit={(reason, followUpDate) =>
              run("wc", () =>
                wcFn({
                  data: { tenantId: job.tenant_id, jobId: job.id, reason, followUpDate },
                }),
              )
            }
          />
          {job.vendor_ticket_number && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={busy !== null}
              onClick={() =>
                run("wv", () => wvFn({ data: { tenantId: job.tenant_id, jobId: job.id } }))
              }
            >
              Mark Waiting Vendor
            </Button>
          )}
          <CompleteDialog
            job={job}
            onSubmit={(note, force) =>
              run("complete", () =>
                completeFn({
                  data: { tenantId: job.tenant_id, jobId: job.id, note, force },
                }),
              )
            }
          />
          <CancelDialog
            onSubmit={(reason) =>
              run("cancel", () =>
                cancelFn({
                  data: { tenantId: job.tenant_id, jobId: job.id, reason },
                }),
              )
            }
          />
        </>
      )}
      {isClosed && (
        <p className="text-xs text-muted-foreground">
          This job is {job.status}. No further actions.
        </p>
      )}
    </div>
  );
}

function ReassignDialog({
  job,
  engineers,
  onSubmit,
}: {
  job: any;
  engineers: { id: string; displayName: string; source: string }[];
  onSubmit: (assigneeId: string | null, reason: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState<string>("__unassigned__");
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          Reassign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign {job.assignedUserLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Assignee</Label>
          <Select value={val} onValueChange={setVal}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned__">Unassigned</SelectItem>
              {engineers.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.displayName} · {e.source === "n3_user" ? "N3" : "Local"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label>Reason (optional)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              onSubmit(val === "__unassigned__" ? null : val, reason.trim() || null);
              setOpen(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WaitingCustomerDialog({
  onSubmit,
}: {
  onSubmit: (reason: string, followUpDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          Mark Waiting Customer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Waiting for Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          <Label>Follow-up Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <DialogFooter>
          <Button
            disabled={!reason.trim() || !date}
            onClick={() => {
              onSubmit(reason, date);
              setOpen(false);
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({
  job,
  onSubmit,
}: {
  job: any;
  onSubmit: (note: string, force: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const needsForce = ["waiting_customer", "waiting_vendor"].includes(job.status);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full">
          Complete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete Job</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Completion Note</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
          {needsForce && (
            <p className="text-xs text-amber-700">
              This job is {job.status.replace("_", " ")}. Confirming will complete it anyway.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={!note.trim()}
            onClick={() => {
              onSubmit(note, needsForce);
              setOpen(false);
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ onSubmit }: { onSubmit: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive" className="w-full">
          Cancel Job
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Job</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!reason.trim()}
            onClick={() => {
              onSubmit(reason);
              setOpen(false);
            }}
          >
            Confirm Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({
  onApprove,
}: {
  onApprove: (t: "ad_hoc_service" | "newly_renewed_contract", note: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<"ad_hoc_service" | "newly_renewed_contract">("ad_hoc_service");
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full">
          Approve
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve Job</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Approval Type</Label>
          <Select value={t} onValueChange={(v) => setT(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ad_hoc_service">Ad Hoc Service</SelectItem>
              <SelectItem value="newly_renewed_contract">Newly Renewed Contract</SelectItem>
            </SelectContent>
          </Select>
          <Label>Note (optional)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              onApprove(t, note.trim() || null);
              setOpen(false);
            }}
          >
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  onReject,
}: {
  onReject: (reason: string, then: "keep_draft" | "cancel") => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [then, setThen] = useState<"keep_draft" | "cancel">("keep_draft");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Approval</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          <Label>Then</Label>
          <Select value={then} onValueChange={(v) => setThen(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keep_draft">Keep as Draft</SelectItem>
              <SelectItem value="cancel">Cancel Job</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!reason.trim()}
            onClick={() => {
              onReject(reason, then);
              setOpen(false);
            }}
          >
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Waiting Customer info ----------
function WaitingCustomerPanel({ job }: { job: any }) {
  return (
    <div className="text-sm space-y-1">
      <div>
        <span className="text-muted-foreground">Reason: </span>
        {job.waiting_customer_reason ?? "—"}
      </div>
      <div>
        <span className="text-muted-foreground">Since: </span>
        {job.waiting_customer_since ? new Date(job.waiting_customer_since).toLocaleString() : "—"}
      </div>
      <div>
        <span className="text-muted-foreground">Follow-up: </span>
        {job.waiting_customer_follow_up_date ?? "—"}
      </div>
    </div>
  );
}

// ---------- Vendor panel ----------
function VendorPanel({ job, onChanged }: { job: any; onChanged: () => void }) {
  const updFn = useServerFn(updateVendorReferral);
  const [name, setName] = useState(job.vendor_name ?? "");
  const [ticket, setTicket] = useState(job.vendor_ticket_number ?? "");
  const [followUp, setFollowUp] = useState(job.vendor_follow_up_date ?? "");
  const [remark, setRemark] = useState(job.vendor_remark ?? "");
  const [status, setStatus] = useState(job.vendor_status ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2 text-sm">
      {err && <p className="text-destructive">{err}</p>}
      <div>
        <Label>Vendor Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label>Vendor Ticket Number</Label>
        <Input value={ticket} onChange={(e) => setTicket(e.target.value)} />
      </div>
      <div>
        <Label>Follow-up Date</Label>
        <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
      </div>
      <div>
        <Label>Vendor Status</Label>
        <Input value={status} onChange={(e) => setStatus(e.target.value)} />
      </div>
      <div>
        <Label>Remark</Label>
        <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} />
      </div>
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await updFn({
              data: {
                tenantId: job.tenant_id,
                jobId: job.id,
                vendorName: name || null,
                vendorTicketNumber: ticket || null,
                vendorFollowUpDate: followUp || null,
                vendorStatus: status || null,
                vendorRemark: remark || null,
              },
            });
            onChanged();
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Save Vendor Info
      </Button>
    </div>
  );
}

// ---------- Edit info ----------
function EditInfoPanel({ job, onChanged }: { job: any; onChanged: () => void }) {
  const updFn = useServerFn(updateJobInfo);
  const [subject, setSubject] = useState(job.title);
  const [description, setDescription] = useState(job.description ?? "");
  const [remark, setRemark] = useState(job.internal_remark ?? "");
  const [priority, setPriority] = useState<"low" | "medium" | "high">(job.priority);
  const [dueDate, setDueDate] = useState(job.due_date ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2 text-sm">
      {err && <p className="text-destructive">{err}</p>}
      <div>
        <Label>Subject</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>
      <div>
        <Label>Internal Remark</Label>
        <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} />
      </div>
      <div>
        <Label>Priority</Label>
        <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Due Date</Label>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await updFn({
              data: {
                tenantId: job.tenant_id,
                jobId: job.id,
                subject,
                description: description || null,
                internalRemark: remark || null,
                priority,
                dueDate: dueDate || null,
              },
            });
            onChanged();
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Save
      </Button>
    </div>
  );
}
