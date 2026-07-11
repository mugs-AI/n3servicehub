/**
 * Milestone 1.5 — Jobs Workspace server functions.
 * Tenant-scoped list, detail, and workflow actions. All permissions enforced
 * server-side. Records activity_logs and notifications automatically.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { effectiveProfile, type UserRole, type EffectiveProfile } from "./support.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------- Membership + permissions ----------

type Membership = {
  id: string;
  role: UserRole;
  profile: EffectiveProfile;
  display_name: string | null;
  email: string;
};

async function loadMembership(supabase: any, userId: string, tenantId: string): Promise<Membership> {
  const { data, error } = await supabase
    .from("users_local")
    .select("id, role, display_name, email, is_active")
    .eq("auth_user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
  return { ...data, profile: effectiveProfile(data.role) } as Membership;
}

async function hasPermission(
  supabase: any,
  tenantId: string,
  profile: EffectiveProfile,
  permissionCode: string,
): Promise<boolean> {
  if (profile === "administrator") return true;
  if (profile === "viewer") return false;
  const { data } = await supabase
    .from("access_profile_permissions")
    .select("is_allowed")
    .eq("tenant_id", tenantId)
    .eq("profile_code", profile)
    .eq("permission_code", permissionCode)
    .maybeSingle();
  return Boolean(data?.is_allowed);
}

async function requirePerm(
  supabase: any,
  tenantId: string,
  profile: EffectiveProfile,
  code: string,
): Promise<void> {
  if (!(await hasPermission(supabase, tenantId, profile, code))) {
    throw new Error(`Forbidden: ${code} required`);
  }
}

// ---------- Activity + notification helpers ----------

async function logActivity(
  supabase: any,
  tenantId: string,
  m: Membership,
  jobId: string,
  action: string,
  before: unknown = null,
  after: unknown = null,
) {
  await supabase.from("activity_logs").insert({
    tenant_id: tenantId,
    entity_type: "job",
    entity_id: jobId,
    action,
    before_value: before as any,
    after_value: after as any,
    user_code: m.email,
    user_type: "local_user",
    result: "success",
  });
}

async function notify(
  supabase: any,
  tenantId: string,
  recipientLocalId: string | null,
  type: string,
  title: string,
  body: string | null,
  jobId: string,
) {
  if (!recipientLocalId) return;
  await supabase.from("notifications").insert({
    tenant_id: tenantId,
    recipient_id: recipientLocalId,
    type: type as any,
    title,
    body,
    entity_table: "jobs",
    entity_id: jobId,
  });
}

// ---------- Job Row typing ----------

type JobRow = {
  id: string;
  tenant_id: string;
  job_no: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  status: string;
  approval_required: boolean;
  approval_status: string;
  approval_type: string | null;
  approval_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  due_date: string | null;
  entry_mode: string | null;
  internal_remark: string | null;

  n3_customer_code: string | null;
  n3_customer_id: string | null;
  n3_customer_name: string | null;

  contract_status_at_creation: string | null;
  contract_document_no_at_creation: string | null;
  contract_expiry_at_creation: string | null;

  created_by: string | null;
  created_by_display_name: string | null;
  created_by_user_code: string | null;
  created_by_user_type: string | null;

  assigned_to: string | null;
  assigned_n3_user_id: string | null;
  assigned_engineer_display_name: string | null;
  assigned_engineer_user_type: "n3_user" | "local_user" | null;

  started_by: string | null;
  started_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  completion_note: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;

  waiting_customer_reason: string | null;
  waiting_customer_since: string | null;
  waiting_customer_follow_up_date: string | null;
  waiting_customer_marked_by: string | null;
  waiting_customer_marked_at: string | null;

  vendor_referral_required: boolean;
  vendor_name: string | null;
  vendor_ticket_number: string | null;
  vendor_referred_at: string | null;
  vendor_follow_up_date: string | null;
  vendor_status: string | null;
  vendor_remark: string | null;
  vendor_resolution: string | null;
  vendor_marked_by: string | null;
  vendor_marked_at: string | null;
};

const JOB_COLS =
  "id, tenant_id, job_no, title, description, priority, status, approval_required, approval_status, approval_type, approval_note, approved_by, approved_at, created_at, updated_at, due_date, entry_mode, internal_remark, n3_customer_code, n3_customer_id, n3_customer_name, contract_status_at_creation, contract_document_no_at_creation, contract_expiry_at_creation, created_by, created_by_display_name, created_by_user_code, created_by_user_type, assigned_to, assigned_n3_user_id, assigned_engineer_display_name, assigned_engineer_user_type, started_by, started_at, completed_by, completed_at, completion_note, cancelled_by, cancelled_at, cancellation_reason, rejected_by, rejected_at, rejection_reason, waiting_customer_reason, waiting_customer_since, waiting_customer_follow_up_date, waiting_customer_marked_by, waiting_customer_marked_at, vendor_referral_required, vendor_name, vendor_ticket_number, vendor_referred_at, vendor_follow_up_date, vendor_status, vendor_remark, vendor_resolution, vendor_marked_by, vendor_marked_at";

async function loadJob(supabase: any, tenantId: string, jobId: string): Promise<JobRow> {
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_COLS)
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Job not found");
  return data as JobRow;
}

// ---------- Assignment resolution ----------

type ResolvedAssignee = {
  assignedToLocalId: string | null;
  assignedN3UserId: string | null;
  displayName: string | null;
  type: "n3_user" | "local_user" | null;
};

async function resolveAssignee(
  supabase: any,
  tenantId: string,
  compositeId: string | null,
): Promise<ResolvedAssignee> {
  if (!compositeId) {
    return { assignedToLocalId: null, assignedN3UserId: null, displayName: null, type: null };
  }
  const [kind, id] = compositeId.split(":");
  if (kind === "local" && id) {
    const { data: lu } = await supabase
      .from("users_local")
      .select("id, display_name, email")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (!lu) throw new Error("Assignee not found (local)");
    return {
      assignedToLocalId: lu.id,
      assignedN3UserId: null,
      displayName: lu.display_name?.trim() || lu.email,
      type: "local_user",
    };
  }
  if (kind === "n3" && id) {
    const { data: nu } = await supabase
      .from("servicehub_users")
      .select("n3_record_id, name, payload")
      .eq("tenant_id", tenantId)
      .eq("n3_record_id", id)
      .eq("is_active", true)
      .maybeSingle();
    if (!nu) throw new Error("Assignee not found (N3)");
    const p = nu.payload as any;
    const name =
      nu.name?.trim() ||
      (p && typeof p === "object" && (p.displayName || p.fullName || p.name || p.userName)) ||
      "(unnamed)";
    return {
      assignedToLocalId: null,
      assignedN3UserId: nu.n3_record_id,
      displayName: name,
      type: "n3_user",
    };
  }
  throw new Error("Invalid assignee id");
}

// ---------- Access rules ----------

function isJobPICOrAssignee(row: JobRow, m: Membership): boolean {
  return row.created_by === m.id || row.assigned_to === m.id;
}

/** Whether a user may edit / act on a job (aside from view). */
function canActOnJob(row: JobRow, m: Membership, allowEditPerm: boolean): boolean {
  if (m.profile === "administrator") return true;
  if (m.profile === "support" && allowEditPerm) return true;
  if (m.profile === "engineer" && row.assigned_to === m.id) return true;
  return isJobPICOrAssignee(row, m);
}

// ---------- Jobs list ----------

export type JobsListRow = {
  id: string;
  jobNo: string;
  createdAt: string;
  updatedAt: string;
  customerCode: string | null;
  customerName: string | null;
  subject: string;
  status: string;
  priority: string;
  approvalStatus: string;
  approvalRequired: boolean;
  assignedUser: string | null;
  createdBy: string | null;
  vendorName: string | null;
  vendorTicketNumber: string | null;
  dueDate: string | null;
};

export type JobsListFilters = {
  view?:
    | "my_open"
    | "all_open"
    | "all"
    | "draft_approval"
    | "pending"
    | "assigned"
    | "in_progress"
    | "waiting_customer"
    | "waiting_vendor"
    | "high_priority"
    | "completed"
    | "cancelled";
  search?: string;
  statuses?: string[];
  priorities?: ("low" | "medium" | "high")[];
  approvalStatuses?: string[];
  customerCode?: string;
  createdBy?: string; // users_local id
  assignedTo?: string; // users_local id
  vendorName?: string;
  vendorTicketNumber?: string;
  unassignedOnly?: boolean;
  createdFrom?: string;
  createdTo?: string;
  dueFrom?: string;
  dueTo?: string;
  limit?: number;
  offset?: number;
};

export type JobsListResult = {
  rows: JobsListRow[];
  total: number;
  assignedUserLabel: string;
  canViewAll: boolean;
};

export const listJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; filters: JobsListFilters }) => i)
  .handler(async ({ data, context }): Promise<JobsListResult> => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    const canViewAll = await hasPermission(
      context.supabase,
      data.tenantId,
      m.profile,
      "view_all_jobs",
    );
    const gs = await context.supabase
      .from("general_settings")
      .select("assigned_user_label")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    const label = gs.data?.assigned_user_label ?? "Engineer";

    const f = data.filters ?? {};
    let q = context.supabase
      .from("jobs")
      .select(
        "id, job_no, created_at, updated_at, n3_customer_code, n3_customer_name, title, status, priority, approval_status, approval_required, assigned_engineer_display_name, created_by_display_name, vendor_name, vendor_ticket_number, due_date, assigned_to, created_by",
        { count: "exact" },
      )
      .eq("tenant_id", data.tenantId);

    // View shortcuts
    const view = f.view ?? "my_open";
    if (view === "my_open") {
      q = q.eq("assigned_to", m.id).not("status", "in", "(completed,cancelled)");
    } else if (view === "all_open") {
      if (!canViewAll) q = q.eq("assigned_to", m.id);
      q = q.not("status", "in", "(completed,cancelled)");
    } else if (view === "all") {
      if (!canViewAll) q = q.eq("assigned_to", m.id);
    } else if (view === "draft_approval") {
      q = q.eq("status", "draft").eq("approval_status", "waiting_approval");
      if (!canViewAll) q = q.eq("assigned_to", m.id);
    } else if (view === "high_priority") {
      q = q.eq("priority", "high").not("status", "in", "(completed,cancelled)");
      if (!canViewAll) q = q.eq("assigned_to", m.id);
    } else {
      // status-based shortcuts
      q = q.eq("status", view);
      if (!canViewAll) q = q.eq("assigned_to", m.id);
    }

    if (f.statuses && f.statuses.length > 0) q = q.in("status", f.statuses);
    if (f.priorities && f.priorities.length > 0) q = q.in("priority", f.priorities);
    if (f.approvalStatuses && f.approvalStatuses.length > 0) q = q.in("approval_status", f.approvalStatuses);
    if (f.customerCode) q = q.eq("n3_customer_code", f.customerCode);
    if (f.createdBy) q = q.eq("created_by", f.createdBy);
    if (f.assignedTo) q = q.eq("assigned_to", f.assignedTo);
    if (f.vendorName) q = q.ilike("vendor_name", `%${f.vendorName}%`);
    if (f.vendorTicketNumber) q = q.ilike("vendor_ticket_number", `%${f.vendorTicketNumber}%`);
    if (f.unassignedOnly) q = q.is("assigned_to", null).is("assigned_n3_user_id", null);
    if (f.createdFrom) q = q.gte("created_at", f.createdFrom);
    if (f.createdTo) q = q.lte("created_at", f.createdTo);
    if (f.dueFrom) q = q.gte("due_date", f.dueFrom);
    if (f.dueTo) q = q.lte("due_date", f.dueTo);

    if (f.search && f.search.trim()) {
      const s = f.search.trim().replace(/[%_]/g, "");
      const like = `%${s}%`;
      q = q.or(
        `job_no.ilike.${like},title.ilike.${like},n3_customer_code.ilike.${like},n3_customer_name.ilike.${like},created_by_display_name.ilike.${like},assigned_engineer_display_name.ilike.${like},vendor_name.ilike.${like},vendor_ticket_number.ilike.${like}`,
      );
    }

    const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
    const offset = Math.max(f.offset ?? 0, 0);
    q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: rows, error, count } = await q;
    if (error) throw error;

    return {
      rows: ((rows ?? []) as any[]).map((r) => ({
        id: r.id,
        jobNo: r.job_no,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        customerCode: r.n3_customer_code,
        customerName: r.n3_customer_name,
        subject: r.title,
        status: r.status,
        priority: r.priority,
        approvalStatus: r.approval_status,
        approvalRequired: r.approval_required,
        assignedUser: r.assigned_engineer_display_name,
        createdBy: r.created_by_display_name,
        vendorName: r.vendor_name,
        vendorTicketNumber: r.vendor_ticket_number,
        dueDate: r.due_date,
      })),
      total: count ?? 0,
      assignedUserLabel: label,
      canViewAll,
    };
  });

// ---------- Full Job detail ----------

export type JobFullDetail = JobRow & {
  contractStatusCurrent: string | null;
  contractExpiryCurrent: string | null;
  contractDocumentNoCurrent: string | null;
  assignedUserLabel: string;
  viewerCanAct: boolean;
  viewerIsAdmin: boolean;
  viewerCanApprove: boolean;
  viewerCanViewActivity: boolean;
};

export const getJobFull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; jobId: string }) => i)
  .handler(async ({ data, context }): Promise<JobFullDetail> => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    // Engineers may only see their own assigned jobs unless View All Jobs.
    const canViewAll = await hasPermission(context.supabase, data.tenantId, m.profile, "view_all_jobs");
    if (!canViewAll && job.assigned_to !== m.id && job.created_by !== m.id) {
      // support/engineer without view_all_jobs and not related to job
      throw new Error("Forbidden");
    }
    const [gs, snap, editPerm] = await Promise.all([
      context.supabase
        .from("general_settings")
        .select("assigned_user_label")
        .eq("tenant_id", data.tenantId)
        .maybeSingle(),
      job.n3_customer_code
        ? context.supabase
            .from("customer_contract_snapshots")
            .select("contract_status, expiry_date, latest_contract_document_no")
            .eq("tenant_id", data.tenantId)
            .eq("n3_customer_code", job.n3_customer_code)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      hasPermission(context.supabase, data.tenantId, m.profile, "edit_jobs"),
    ]);
    return {
      ...job,
      contractStatusCurrent: snap.data?.contract_status ?? job.contract_status_at_creation,
      contractExpiryCurrent: snap.data?.expiry_date ?? job.contract_expiry_at_creation,
      contractDocumentNoCurrent:
        snap.data?.latest_contract_document_no ?? job.contract_document_no_at_creation,
      assignedUserLabel: gs.data?.assigned_user_label ?? "Engineer",
      viewerCanAct: canActOnJob(job, m, editPerm),
      viewerIsAdmin: m.profile === "administrator",
      viewerCanApprove: m.profile === "administrator",
      viewerCanViewActivity: m.profile === "administrator" || m.profile === "support",
    };
  });

// ---------- Comments ----------

export type JobComment = {
  id: string;
  createdAt: string;
  body: string;
  authorName: string | null;
  authorRole: string | null;
};

export const listJobComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; jobId: string }) => i)
  .handler(async ({ data, context }): Promise<JobComment[]> => {
    await loadMembership(context.supabase, context.userId, data.tenantId);
    // Cross-check job tenant
    const { data: job } = await context.supabase
      .from("jobs")
      .select("id")
      .eq("id", data.jobId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (!job) throw new Error("Job not found");
    const { data: rows, error } = await context.supabase
      .from("job_comments")
      .select("id, created_at, body, author_id, users_local:author_id(display_name, email, role)")
      .eq("tenant_id", data.tenantId)
      .eq("job_id", data.jobId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      body: r.body,
      authorName: r.users_local?.display_name?.trim() || r.users_local?.email || null,
      authorRole: r.users_local?.role ?? null,
    }));
  });

export const addJobComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; jobId: string; body: string }) => i)
  .handler(async ({ data, context }) => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    await requirePerm(context.supabase, data.tenantId, m.profile, "add_job_comments");
    const body = data.body?.trim();
    if (!body) throw new Error("Comment is required");
    if (body.length > 4000) throw new Error("Comment too long");
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    const { error } = await context.supabase.from("job_comments").insert({
      tenant_id: data.tenantId,
      job_id: data.jobId,
      body,
      author_id: m.id,
      is_internal: false,
    });
    if (error) throw error;
    await logActivity(context.supabase, data.tenantId, m, data.jobId, "comment_added", null, { length: body.length });
    // Notify assigned + creator (except self)
    const recipients = new Set<string>();
    if (job.assigned_to && job.assigned_to !== m.id) recipients.add(job.assigned_to);
    if (job.created_by && job.created_by !== m.id) recipients.add(job.created_by);
    for (const r of recipients) {
      await notify(
        context.supabase,
        data.tenantId,
        r,
        "job_comment",
        `Comment on ${job.job_no}`,
        body.slice(0, 240),
        data.jobId,
      );
    }
    return { ok: true };
  });

// ---------- Attachments ----------

export type JobAttachment = {
  id: string;
  fileName: string;
  createdAt: string;
  storagePath: string;
  uploadedByName: string | null;
};

export const listJobAttachments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; jobId: string }) => i)
  .handler(async ({ data, context }): Promise<JobAttachment[]> => {
    await loadMembership(context.supabase, context.userId, data.tenantId);
    const { data: rows, error } = await context.supabase
      .from("job_attachments")
      .select("id, file_name, file_url, created_at, users_local:uploaded_by(display_name, email)")
      .eq("tenant_id", data.tenantId)
      .eq("job_id", data.jobId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      fileName: r.file_name,
      storagePath: r.file_url,
      createdAt: r.created_at,
      uploadedByName: r.users_local?.display_name?.trim() || r.users_local?.email || null,
    }));
  });

export const addJobAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { tenantId: string; jobId: string; storagePath: string; fileName: string }) => i,
  )
  .handler(async ({ data, context }) => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    await requirePerm(context.supabase, data.tenantId, m.profile, "upload_attachments");
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    if (!data.storagePath.startsWith(`${data.tenantId}/`)) {
      throw new Error("Attachment path must be tenant-scoped");
    }
    const { error } = await context.supabase.from("job_attachments").insert({
      tenant_id: data.tenantId,
      job_id: data.jobId,
      file_name: data.fileName,
      file_url: data.storagePath,
      uploaded_by: m.id,
    });
    if (error) throw error;
    await logActivity(context.supabase, data.tenantId, m, data.jobId, "attachment_uploaded", null, {
      fileName: data.fileName,
    });
    void job;
    return { ok: true };
  });

export const signAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; storagePath: string }) => i)
  .handler(async ({ data, context }) => {
    await loadMembership(context.supabase, context.userId, data.tenantId);
    if (!data.storagePath.startsWith(`${data.tenantId}/`)) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("job-attachments")
      .createSignedUrl(data.storagePath, 60);
    if (error) throw error;
    return { url: signed.signedUrl };
  });

// ---------- Reassign / Update information ----------

export const updateJobInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      tenantId: string;
      jobId: string;
      subject?: string;
      description?: string | null;
      internalRemark?: string | null;
      priority?: "low" | "medium" | "high";
      dueDate?: string | null;
    }) => i,
  )
  .handler(async ({ data, context }) => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    await requirePerm(context.supabase, data.tenantId, m.profile, "edit_jobs");
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    if (!canActOnJob(job, m, true)) throw new Error("Forbidden");
    const patch: Record<string, unknown> = {};
    if (data.subject !== undefined) {
      const s = data.subject.trim();
      if (!s) throw new Error("Subject is required");
      if (s.length > 200) throw new Error("Subject too long");
      patch.title = s;
    }
    if (data.description !== undefined) patch.description = data.description;
    if (data.internalRemark !== undefined) patch.internal_remark = data.internalRemark;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.dueDate !== undefined) patch.due_date = data.dueDate;
    const { error } = await context.supabase
      .from("jobs")
      .update(patch)
      .eq("id", data.jobId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    if (data.priority !== undefined && data.priority !== job.priority) {
      await logActivity(context.supabase, data.tenantId, m, data.jobId, "priority_changed", { from: job.priority }, { to: data.priority });
      if (data.priority === "high" && job.assigned_to) {
        await notify(
          context.supabase,
          data.tenantId,
          job.assigned_to,
          "high_priority_assigned",
          `High priority: ${job.job_no}`,
          job.title,
          data.jobId,
        );
      }
    } else {
      await logActivity(context.supabase, data.tenantId, m, data.jobId, "info_updated", null, patch);
    }
    return { ok: true };
  });

export const reassignJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { tenantId: string; jobId: string; assigneeId: string | null; reason?: string | null }) => i,
  )
  .handler(async ({ data, context }) => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    await requirePerm(context.supabase, data.tenantId, m.profile, "reassign_engineer");
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    if (!canActOnJob(job, m, true)) throw new Error("Forbidden");
    const resolved = await resolveAssignee(context.supabase, data.tenantId, data.assigneeId);
    const patch: Record<string, unknown> = {
      assigned_to: resolved.assignedToLocalId,
      assigned_n3_user_id: resolved.assignedN3UserId,
      assigned_engineer_display_name: resolved.displayName,
      assigned_engineer_user_type: resolved.type,
    };
    // If job is pending and we assign, promote to assigned.
    if (job.status === "pending" && resolved.assignedToLocalId) patch.status = "assigned";
    const { error } = await context.supabase
      .from("jobs")
      .update(patch)
      .eq("id", data.jobId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    await logActivity(
      context.supabase,
      data.tenantId,
      m,
      data.jobId,
      job.assigned_engineer_display_name ? "assignee_changed" : "assignee_set",
      { previous: job.assigned_engineer_display_name },
      { next: resolved.displayName, reason: data.reason ?? null },
    );
    if (resolved.assignedToLocalId && resolved.assignedToLocalId !== job.assigned_to) {
      await notify(
        context.supabase,
        data.tenantId,
        resolved.assignedToLocalId,
        job.assigned_to ? "job_reassigned" : "job_assigned",
        `Job ${job.job_no} assigned`,
        job.title,
        data.jobId,
      );
    }
    return { ok: true };
  });

// ---------- Start job ----------

export const startJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; jobId: string }) => i)
  .handler(async ({ data, context }) => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    if (!canActOnJob(job, m, await hasPermission(context.supabase, data.tenantId, m.profile, "edit_jobs"))) {
      throw new Error("Forbidden");
    }
    if (job.approval_required && job.approval_status !== "approved") {
      throw new Error("Job cannot start until approved");
    }
    if (["completed", "cancelled"].includes(job.status)) throw new Error("Job is closed");
    const { error } = await context.supabase
      .from("jobs")
      .update({
        status: "in_progress",
        started_by: m.id,
        started_at: new Date().toISOString(),
      })
      .eq("id", data.jobId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    await logActivity(context.supabase, data.tenantId, m, data.jobId, "job_started", { from: job.status }, { to: "in_progress" });
    return { ok: true };
  });

// ---------- Waiting Customer ----------

export const markWaitingCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { tenantId: string; jobId: string; reason: string; followUpDate: string }) => i,
  )
  .handler(async ({ data, context }) => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    await requirePerm(context.supabase, data.tenantId, m.profile, "mark_waiting_customer");
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    if (!canActOnJob(job, m, true)) throw new Error("Forbidden");
    const reason = data.reason?.trim();
    if (!reason) throw new Error("Reason is required");
    if (!data.followUpDate) throw new Error("Follow-up date is required");
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("jobs")
      .update({
        status: "waiting_customer",
        waiting_customer_reason: reason,
        waiting_customer_since: now,
        waiting_customer_follow_up_date: data.followUpDate,
        waiting_customer_marked_by: m.id,
        waiting_customer_marked_at: now,
      })
      .eq("id", data.jobId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    await logActivity(context.supabase, data.tenantId, m, data.jobId, "waiting_customer_marked", null, {
      reason,
      followUpDate: data.followUpDate,
    });
    if (job.assigned_to && job.assigned_to !== m.id) {
      await notify(
        context.supabase,
        data.tenantId,
        job.assigned_to,
        "waiting_customer_followup",
        `Waiting Customer: ${job.job_no}`,
        `Follow-up on ${data.followUpDate}`,
        data.jobId,
      );
    }
    return { ok: true };
  });

// ---------- Waiting Vendor ----------

export const updateVendorReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      tenantId: string;
      jobId: string;
      vendorName?: string | null;
      vendorTicketNumber?: string | null;
      vendorReferredAt?: string | null;
      vendorFollowUpDate?: string | null;
      vendorStatus?: string | null;
      vendorRemark?: string | null;
    }) => i,
  )
  .handler(async ({ data, context }) => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    await requirePerm(context.supabase, data.tenantId, m.profile, "mark_waiting_vendor");
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    if (!canActOnJob(job, m, true)) throw new Error("Forbidden");
    const patch: Record<string, unknown> = {};
    if (data.vendorName !== undefined) patch.vendor_name = data.vendorName;
    if (data.vendorTicketNumber !== undefined) patch.vendor_ticket_number = data.vendorTicketNumber;
    if (data.vendorReferredAt !== undefined) patch.vendor_referred_at = data.vendorReferredAt;
    if (data.vendorFollowUpDate !== undefined) patch.vendor_follow_up_date = data.vendorFollowUpDate;
    if (data.vendorStatus !== undefined) patch.vendor_status = data.vendorStatus;
    if (data.vendorRemark !== undefined) patch.vendor_remark = data.vendorRemark;
    if (data.vendorTicketNumber && !job.vendor_referral_required) patch.vendor_referral_required = true;
    const { error } = await context.supabase
      .from("jobs")
      .update(patch)
      .eq("id", data.jobId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    await logActivity(context.supabase, data.tenantId, m, data.jobId, "vendor_referral_updated", null, patch);
    return { ok: true };
  });

export const markWaitingVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; jobId: string }) => i)
  .handler(async ({ data, context }) => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    await requirePerm(context.supabase, data.tenantId, m.profile, "mark_waiting_vendor");
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    if (!canActOnJob(job, m, true)) throw new Error("Forbidden");
    if (!job.vendor_ticket_number) throw new Error("Vendor Ticket Number is required first");
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("jobs")
      .update({
        status: "waiting_vendor",
        vendor_referral_required: true,
        vendor_marked_by: m.id,
        vendor_marked_at: now,
      })
      .eq("id", data.jobId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    await logActivity(context.supabase, data.tenantId, m, data.jobId, "waiting_vendor_marked", { from: job.status }, {
      vendorTicket: job.vendor_ticket_number,
    });
    if (job.assigned_to && job.assigned_to !== m.id) {
      await notify(
        context.supabase,
        data.tenantId,
        job.assigned_to,
        "waiting_vendor_followup",
        `Waiting Vendor: ${job.job_no}`,
        job.vendor_ticket_number,
        data.jobId,
      );
    }
    return { ok: true };
  });

export const resumeJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; jobId: string; from: "customer" | "vendor" }) => i)
  .handler(async ({ data, context }) => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    if (!canActOnJob(job, m, await hasPermission(context.supabase, data.tenantId, m.profile, "edit_jobs"))) {
      throw new Error("Forbidden");
    }
    const { error } = await context.supabase
      .from("jobs")
      .update({ status: "in_progress" })
      .eq("id", data.jobId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    await logActivity(
      context.supabase,
      data.tenantId,
      m,
      data.jobId,
      data.from === "vendor" ? "vendor_replied" : "waiting_customer_resumed",
      { from: job.status },
      { to: "in_progress" },
    );
    return { ok: true };
  });

// ---------- Approval workflow ----------

export const approveJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      tenantId: string;
      jobId: string;
      approvalType: "ad_hoc_service" | "newly_renewed_contract";
      note?: string | null;
    }) => i,
  )
  .handler(async ({ data, context }) => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    if (m.profile !== "administrator") throw new Error("Forbidden: administrator only");
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    if (!job.approval_required) throw new Error("Job does not require approval");
    if (job.approval_status === "approved") throw new Error("Already approved");
    const jobServiceType =
      data.approvalType === "ad_hoc_service" ? "ad_hoc_service" : "renewal_follow_up";
    const nextStatus = job.assigned_to || job.assigned_n3_user_id ? "assigned" : "pending";
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("jobs")
      .update({
        approval_status: "approved",
        approval_type: data.approvalType,
        approval_note: data.note ?? null,
        approved_by: m.id,
        approved_at: now,
        job_service_type: jobServiceType,
        status: nextStatus,
      })
      .eq("id", data.jobId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    await logActivity(context.supabase, data.tenantId, m, data.jobId, "job_approved", null, {
      approvalType: data.approvalType,
    });
    if (job.assigned_to) {
      await notify(
        context.supabase,
        data.tenantId,
        job.assigned_to,
        "job_approved",
        `Approved: ${job.job_no}`,
        data.approvalType.replace(/_/g, " "),
        data.jobId,
      );
    }
    if (job.created_by && job.created_by !== job.assigned_to) {
      await notify(
        context.supabase,
        data.tenantId,
        job.created_by,
        "job_approved",
        `Approved: ${job.job_no}`,
        data.approvalType.replace(/_/g, " "),
        data.jobId,
      );
    }
    return { ok: true };
  });

export const rejectJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { tenantId: string; jobId: string; reason: string; then: "keep_draft" | "cancel" }) => i,
  )
  .handler(async ({ data, context }) => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    if (m.profile !== "administrator") throw new Error("Forbidden: administrator only");
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    if (!job.approval_required) throw new Error("Job does not require approval");
    const reason = data.reason?.trim();
    if (!reason) throw new Error("Rejection reason required");
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      approval_status: "rejected",
      rejection_reason: reason,
      rejected_by: m.id,
      rejected_at: now,
    };
    if (data.then === "cancel") {
      patch.status = "cancelled";
      patch.cancelled_by = m.id;
      patch.cancelled_at = now;
      patch.cancellation_reason = `Approval rejected: ${reason}`;
    }
    const { error } = await context.supabase
      .from("jobs")
      .update(patch)
      .eq("id", data.jobId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    await logActivity(context.supabase, data.tenantId, m, data.jobId, "job_rejected", null, {
      reason,
      then: data.then,
    });
    if (job.created_by && job.created_by !== m.id) {
      await notify(
        context.supabase,
        data.tenantId,
        job.created_by,
        "job_rejected",
        `Rejected: ${job.job_no}`,
        reason,
        data.jobId,
      );
    }
    return { ok: true };
  });

// ---------- Complete / Cancel ----------

export const completeJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; jobId: string; note: string; force?: boolean }) => i)
  .handler(async ({ data, context }) => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    await requirePerm(context.supabase, data.tenantId, m.profile, "complete_job");
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    if (!canActOnJob(job, m, true)) throw new Error("Forbidden");
    const note = data.note?.trim();
    if (!note) throw new Error("Completion note is required");
    if (job.approval_required && job.approval_status !== "approved") {
      throw new Error("Cannot complete a job that awaits approval");
    }
    if (["waiting_customer", "waiting_vendor"].includes(job.status) && !data.force) {
      throw new Error(`Job is in ${job.status.replace("_", " ")}. Confirm to complete.`);
    }
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("jobs")
      .update({
        status: "completed",
        completed_by: m.id,
        completed_at: now,
        completion_note: note,
        actual_end: now,
      })
      .eq("id", data.jobId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    await logActivity(context.supabase, data.tenantId, m, data.jobId, "job_completed", { from: job.status }, { note });
    return { ok: true };
  });

export const cancelJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; jobId: string; reason: string }) => i)
  .handler(async ({ data, context }) => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    await requirePerm(context.supabase, data.tenantId, m.profile, "cancel_job");
    const job = await loadJob(context.supabase, data.tenantId, data.jobId);
    if (!canActOnJob(job, m, true)) throw new Error("Forbidden");
    const reason = data.reason?.trim();
    if (!reason) throw new Error("Cancellation reason is required");
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("jobs")
      .update({
        status: "cancelled",
        cancelled_by: m.id,
        cancelled_at: now,
        cancellation_reason: reason,
      })
      .eq("id", data.jobId)
      .eq("tenant_id", data.tenantId);
    if (error) throw error;
    await logActivity(context.supabase, data.tenantId, m, data.jobId, "job_cancelled", { from: job.status }, { reason });
    return { ok: true };
  });

// ---------- Activity log ----------

export type ActivityEntry = {
  id: string;
  action: string;
  createdAt: string;
  userCode: string | null;
  before: unknown;
  after: unknown;
};

export const listJobActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; jobId: string }) => i)
  .handler(async ({ data, context }): Promise<ActivityEntry[]> => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    if (!(m.profile === "administrator" || m.profile === "support")) {
      throw new Error("Forbidden");
    }
    const { data: rows, error } = await context.supabase
      .from("activity_logs")
      .select("id, action, created_at, user_code, before_value, after_value")
      .eq("tenant_id", data.tenantId)
      .eq("entity_type", "job")
      .eq("entity_id", data.jobId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      action: r.action,
      createdAt: r.created_at,
      userCode: r.user_code,
      before: r.before_value,
      after: r.after_value,
    }));
  });
