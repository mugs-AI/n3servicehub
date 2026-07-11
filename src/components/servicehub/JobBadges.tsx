/**
 * Milestone 1.5.1 — Shared semantic badges for Jobs UI.
 * Presentational only. Do not change business logic.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CircleDashed,
  Clock,
  UserCheck,
  Play,
  PauseCircle,
  Truck,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Minus,
  ChevronsUp,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type StatusKey =
  | "draft"
  | "pending"
  | "assigned"
  | "in_progress"
  | "waiting_customer"
  | "waiting_vendor"
  | "waiting_approval"
  | "completed"
  | "cancelled";

const STATUS: Record<StatusKey, { label: string; cls: string; Icon: LucideIcon }> = {
  draft: {
    label: "Draft",
    cls: "bg-zinc-100 text-zinc-700 border-zinc-200",
    Icon: CircleDashed,
  },
  pending: {
    label: "Pending",
    cls: "bg-blue-50 text-blue-700 border-blue-200",
    Icon: Clock,
  },
  assigned: {
    label: "Assigned",
    cls: "bg-indigo-50 text-indigo-700 border-indigo-200",
    Icon: UserCheck,
  },
  in_progress: {
    label: "In Progress",
    cls: "bg-teal-50 text-teal-700 border-teal-200",
    Icon: Play,
  },
  waiting_customer: {
    label: "Waiting Customer",
    cls: "bg-amber-50 text-amber-800 border-amber-200",
    Icon: PauseCircle,
  },
  waiting_vendor: {
    label: "Waiting Vendor",
    cls: "bg-orange-50 text-orange-800 border-orange-200",
    Icon: Truck,
  },
  waiting_approval: {
    label: "Waiting Approval",
    cls: "bg-amber-50 text-amber-800 border-amber-200",
    Icon: ShieldAlert,
  },
  completed: {
    label: "Completed",
    cls: "bg-green-50 text-green-700 border-green-200",
    Icon: CheckCircle2,
  },
  cancelled: {
    label: "Cancelled",
    cls: "bg-red-50 text-red-700 border-red-200",
    Icon: XCircle,
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = (status in STATUS ? status : "pending") as StatusKey;
  const { label, cls, Icon } = STATUS[key];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-medium", cls, className)}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </Badge>
  );
}

const PRIORITY: Record<
  string,
  { label: string; cls: string; Icon: LucideIcon }
> = {
  high: {
    label: "High",
    cls: "bg-red-50 text-red-700 border-red-200",
    Icon: ChevronsUp,
  },
  medium: {
    label: "Medium",
    cls: "bg-amber-50 text-amber-800 border-amber-200",
    Icon: ChevronUp,
  },
  low: {
    label: "Low",
    cls: "bg-slate-50 text-slate-600 border-slate-200",
    Icon: ChevronDown,
  },
};

export function PriorityBadge({
  priority,
  className,
}: {
  priority: string;
  className?: string;
}) {
  const p = PRIORITY[priority] ?? PRIORITY.low;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-medium", p.cls, className)}
    >
      <p.Icon className="h-3 w-3" aria-hidden />
      {p.label}
    </Badge>
  );
}

const APPROVAL: Record<
  string,
  { label: string; cls: string; Icon: LucideIcon }
> = {
  waiting_approval: {
    label: "Waiting Approval",
    cls: "bg-amber-50 text-amber-800 border-amber-200",
    Icon: ShieldAlert,
  },
  approved: {
    label: "Approved",
    cls: "bg-green-50 text-green-700 border-green-200",
    Icon: ShieldCheck,
  },
  rejected: {
    label: "Rejected",
    cls: "bg-red-50 text-red-700 border-red-200",
    Icon: ShieldX,
  },
  not_required: {
    label: "Not Required",
    cls: "bg-zinc-100 text-zinc-600 border-zinc-200",
    Icon: Minus,
  },
};

export function ApprovalBadge({
  required,
  status,
  className,
}: {
  required: boolean;
  status?: string | null;
  className?: string;
}) {
  const key = required ? status ?? "waiting_approval" : "not_required";
  const a = APPROVAL[key] ?? APPROVAL.not_required;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-medium", a.cls, className)}
    >
      <a.Icon className="h-3 w-3" aria-hidden />
      {a.label}
    </Badge>
  );
}

export function Avatar({ name }: { name?: string | null }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";
  return (
    <span
      className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
      aria-hidden
    >
      {initials}
    </span>
  );
}
