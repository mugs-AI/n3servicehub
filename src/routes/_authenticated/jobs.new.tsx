/**
 * Milestone 1.4 — Standard Job Entry (desktop-first).
 */

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCustomerSummary,
  listEngineerOptions,
  getMyTenants,
} from "@/lib/support.functions";
import { createJob } from "@/lib/jobs.functions";
import { CustomerSummaryCard } from "@/components/servicehub/CustomerSummaryCard";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  tenant: z.string().uuid().optional(),
  customer: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/jobs/new")({
  validateSearch: (s) => searchSchema.parse(s),
  component: StandardJobEntry,
});

const MAX_ATTACHMENT_MB = 10;
const ALLOWED_TYPES = [
  "image/",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/zip",
  "application/x-zip-compressed",
];

function StandardJobEntry() {
  const { tenant, customer } = Route.useSearch();
  const navigate = useNavigate();
  const tenantsFn = useServerFn(getMyTenants);
  const tenants = useQuery({ queryKey: ["my-tenants"], queryFn: () => tenantsFn() });
  const tenantId = tenant ?? tenants.data?.[0]?.tenantId ?? "";

  if (!tenantId) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!customer) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold">Standard Job</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please select a Customer from the Support Dashboard first.
        </p>
        <Button asChild className="mt-4">
          <Link to="/support">Back to Support Dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <StandardJobForm
      tenantId={tenantId}
      customerCode={customer}
      onSuccess={(id) => navigate({ to: "/jobs/created/$id", params: { id }, search: { tenant: tenantId } })}
    />
  );
}

function StandardJobForm({
  tenantId,
  customerCode,
  onSuccess,
}: {
  tenantId: string;
  customerCode: string;
  onSuccess: (id: string) => void;
}) {
  const summaryFn = useServerFn(getCustomerSummary);
  const engineersFn = useServerFn(listEngineerOptions);
  const createFn = useServerFn(createJob);

  const summary = useQuery({
    queryKey: ["customer-summary", tenantId, customerCode],
    queryFn: () => summaryFn({ data: { tenantId, customerCode } }),
  });
  const engineers = useQuery({
    queryKey: ["engineer-options", tenantId],
    queryFn: () => engineersFn({ data: { tenantId } }),
  });

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [engineerId, setEngineerId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [internalRemark, setInternalRemark] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = summary.data?.contractStatus;
  const warning = useMemo(() => {
    switch (status) {
      case "overdue":
        return "Customer contract is overdue. This Job will be saved as Draft and requires approval before service work continues.";
      case "suspended":
        return "Customer is suspended. This Job will be saved as Draft and requires approval.";
      case "unknown":
        return "No valid renewal record was found. This Job will be saved as Draft and requires approval.";
      case "due_soon":
        return summary.data?.remainingDays !== null && summary.data?.remainingDays !== undefined
          ? `Contract expires in ${summary.data.remainingDays} days.`
          : null;
      default:
        return null;
    }
  }, [status, summary.data]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    setSubmitting(true);
    try {
      let attachment: { storagePath: string; fileName: string } | null = null;
      if (file) {
        if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
          throw new Error(`Attachment exceeds ${MAX_ATTACHMENT_MB} MB.`);
        }
        if (!ALLOWED_TYPES.some((t) => file.type.startsWith(t))) {
          throw new Error("Attachment type not supported.");
        }
        const safeName = file.name.replace(/[^\w.\-]/g, "_");
        const tempPath = `${tenantId}/tmp/${Date.now()}-${safeName}`;
        const up = await supabase.storage.from("job-attachments").upload(tempPath, file, {
          upsert: false,
          contentType: file.type,
        });
        if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
        attachment = { storagePath: tempPath, fileName: safeName };
      }
      const created = await createFn({
        data: {
          tenantId,
          mode: "standard",
          customerCode,
          subject: subject.trim(),
          description: description.trim() || null,
          priority,
          assignedEngineerId: engineerId || null,
          dueDate: dueDate || null,
          internalRemark: internalRemark.trim() || null,
          attachment,
        },
      });
      onSuccess(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Standard Job</h1>
          <p className="text-sm text-muted-foreground">
            Record a Customer request and assign it to an engineer.
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link to="/support">Cancel</Link>
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Job Details</CardTitle>
          </CardHeader>
          <CardContent>
            {warning && (
              <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {warning}
              </div>
            )}
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label>Subject *</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "medium" | "high")}>
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
              </div>
              <div>
                <Label>Assigned Engineer</Label>
                <Select value={engineerId || "__none"} onValueChange={(v) => setEngineerId(v === "__none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Unassigned</SelectItem>
                    {(engineers.data ?? []).map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.displayName} — {e.source === "n3_user" ? "N3 User" : "Local User"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Internal Remark</Label>
                <Textarea value={internalRemark} onChange={(e) => setInternalRemark(e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Attachment (optional, max {MAX_ATTACHMENT_MB} MB)</Label>
                <Input
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Create Job"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div>
          {summary.isLoading && <p className="text-sm text-muted-foreground">Loading customer…</p>}
          {summary.data && <CustomerSummaryCard summary={summary.data} />}
        </div>
      </div>
    </main>
  );
}
