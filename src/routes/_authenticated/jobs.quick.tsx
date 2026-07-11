/**
 * Milestone 1.4 — Quick Job Entry (mobile-first).
 */

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { getCustomerSummary, getMyTenants } from "@/lib/support.functions";
import { createJob } from "@/lib/jobs.functions";
import { ContractStatusBadge } from "@/components/servicehub/ContractStatusBadge";

const searchSchema = z.object({
  tenant: z.string().uuid().optional(),
  customer: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/jobs/quick")({
  validateSearch: (s) => searchSchema.parse(s),
  component: QuickJobEntry,
});

function QuickJobEntry() {
  const { tenant, customer } = Route.useSearch();
  const navigate = useNavigate();
  const tenantsFn = useServerFn(getMyTenants);
  const tenants = useQuery({ queryKey: ["my-tenants"], queryFn: () => tenantsFn() });
  const tenantId = tenant ?? tenants.data?.[0]?.tenantId ?? "";

  if (!tenantId) return <div className="p-6 text-sm">Loading…</div>;
  if (!customer) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">Quick Job</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please select a Customer from the Support Dashboard first.
        </p>
        <Button asChild className="mt-4 w-full">
          <Link to="/support">Back to Support Dashboard</Link>
        </Button>
      </main>
    );
  }

  return (
    <QuickForm
      tenantId={tenantId}
      customerCode={customer}
      onSuccess={(id) =>
        navigate({ to: "/jobs/created/$id", params: { id }, search: { tenant: tenantId } })
      }
    />
  );
}

function QuickForm({
  tenantId,
  customerCode,
  onSuccess,
}: {
  tenantId: string;
  customerCode: string;
  onSuccess: (id: string) => void;
}) {
  const summaryFn = useServerFn(getCustomerSummary);
  const createFn = useServerFn(createJob);
  const summary = useQuery({
    queryKey: ["customer-summary", tenantId, customerCode],
    queryFn: () => summaryFn({ data: { tenantId, customerCode } }),
  });

  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!subject.trim()) {
      setError("Please describe the problem.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createFn({
        data: {
          tenantId,
          mode: "quick",
          customerCode,
          subject: subject.trim(),
          priority,
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
    <main className="mx-auto max-w-md px-4 py-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quick Job</h1>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/support">Cancel</Link>
        </Button>
      </header>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {summary.data?.name ?? customerCode}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 pt-0 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs">{customerCode}</span>
            {summary.data && (
              <ContractStatusBadge status={summary.data.contractStatus} />
            )}
          </div>
        </CardContent>
      </Card>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="qj-subject">Problem Description *</Label>
          <Textarea
            id="qj-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            rows={4}
            className="text-base"
            placeholder="Short problem description"
            required
          />
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "medium" | "high")}>
            <SelectTrigger className="h-12 text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-12 w-full text-base" disabled={submitting}>
          {submitting ? "Saving…" : "Save Quick Job"}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          Voice Note — Future Enhancement
        </p>
      </form>
    </main>
  );
}
