/**
 * Reusable Customer Summary Card.
 * Used in Customer Service Console, Job Detail, Pending Queue, Calendar,
 * and Dashboard drill-down (future milestones).
 *
 * Never displays pricing, credit limits, or invoice amounts.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContractStatusBadge } from "./ContractStatusBadge";
import type { CustomerSummary } from "@/lib/support.functions";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export function CustomerSummaryCard({
  summary,
  onOpenInN3,
}: {
  summary: CustomerSummary;
  /** Provide only when a real N3 deep-link is configured. */
  onOpenInN3?: () => void;
}) {
  const n3Disabled = !onOpenInN3;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg">
            {summary.name ?? "(unnamed customer)"}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Code: <span className="font-mono">{summary.code}</span>
          </p>
        </div>
        <ContractStatusBadge status={summary.contractStatus} />
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Phone" value={summary.phone ?? "—"} />
          <Field label="Contact Person" value={summary.contactPerson ?? "—"} />
        </section>

        <section className="rounded-md border bg-muted/30 p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Latest Contract
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field
              label="Source"
              value={
                summary.latestContractSource === "sales_invoice"
                  ? "Sales Invoice"
                  : summary.latestContractSource === "delivery_order"
                    ? "Delivery Order"
                    : "—"
              }
            />
            <Field label="Document No" value={summary.latestContractDocumentNo ?? "—"} />
            <Field label="Contract Date" value={fmtDate(summary.latestContractDate)} />
            <Field label="Renewal Stock" value={summary.latestContractStockCode ?? "—"} />
            <Field label="Start Date" value={fmtDate(summary.contractStartDate)} />
            <Field label="Expiry Date" value={fmtDate(summary.expiryDate)} />
            <Field
              label="Remaining Days"
              value={
                summary.remainingDays === null || summary.remainingDays === undefined
                  ? "—"
                  : `${summary.remainingDays} day(s)`
              }
            />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Open Jobs" value={String(summary.openJobCount)} />
          <Field label="Latest Job" value={summary.latestJobNo ?? "—"} />
          <Field label="Latest Job Date" value={fmtDate(summary.latestJobDate)} />
        </section>

        <section>
          <Field label="Last Assigned Engineer" value={summary.lastAssignedEngineer ?? "—"} />
        </section>

        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={n3Disabled}
            onClick={onOpenInN3}
          >
            Open in N3
          </Button>
          {n3Disabled && (
            <span className="text-xs text-muted-foreground">
              N3 Customer link is not configured.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
