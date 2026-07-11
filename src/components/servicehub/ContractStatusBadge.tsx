import { Badge } from "@/components/ui/badge";

export type ContractStatus = "active" | "due_soon" | "overdue" | "suspended" | "unknown";

const LABELS: Record<ContractStatus, string> = {
  active: "Active",
  due_soon: "Due Soon",
  overdue: "Overdue",
  suspended: "Suspended",
  unknown: "Unknown",
};

const CLASSES: Record<ContractStatus, string> = {
  active: "bg-green-100 text-green-800 border-green-200 hover:bg-green-100",
  due_soon: "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100",
  overdue: "bg-red-100 text-red-800 border-red-200 hover:bg-red-100",
  suspended: "bg-zinc-800 text-zinc-100 border-zinc-800 hover:bg-zinc-800",
  unknown: "bg-zinc-200 text-zinc-700 border-zinc-300 hover:bg-zinc-200",
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return (
    <Badge variant="outline" className={CLASSES[status]}>
      {LABELS[status]}
    </Badge>
  );
}
