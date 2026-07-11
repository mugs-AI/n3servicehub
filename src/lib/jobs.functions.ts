/**
 * Milestone 1.4 — Job creation server functions (Standard + Quick).
 * Server enforces tenant, permissions, contract-driven routing, and PIC tracking.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { effectiveProfile, type UserRole } from "./support.functions";

type ContractStatus = "active" | "due_soon" | "overdue" | "suspended" | "unknown";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadMembership(supabase: any, userId: string, tenantId: string) {
  const { data, error } = await supabase
    .from("users_local")
    .select("id, role, display_name, email, is_active")
    .eq("auth_user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Forbidden: not a member of this tenant");
  return data as {
    id: string;
    role: UserRole;
    display_name: string | null;
    email: string;
    is_active: boolean;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hasPermission(supabase: any, tenantId: string, role: UserRole, permissionCode: string) {
  const profile = effectiveProfile(role);
  if (profile === "administrator") return true;
  if (profile === "viewer") return false;
  const { data, error } = await supabase
    .from("access_profile_permissions")
    .select("is_allowed")
    .eq("tenant_id", tenantId)
    .eq("profile_code", profile)
    .eq("permission_code", permissionCode)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.is_allowed);
}

export type CreateJobInput = {
  tenantId: string;
  mode: "standard" | "quick";
  customerCode: string;
  subject: string;
  description?: string | null;
  priority?: "low" | "medium" | "high";
  assignedEngineerId?: string | null; // composite: "n3:<id>" or "local:<uuid>"
  dueDate?: string | null; // YYYY-MM-DD
  internalRemark?: string | null;
  attachment?: {
    storagePath: string; // {tenantId}/{tempId}/{filename}
    fileName: string;
  } | null;
};

export type CreatedJob = {
  id: string;
  jobNo: string;
  workflowStatus: string;
  approvalStatus: string;
  approvalRequired: boolean;
  customerCode: string;
  customerName: string | null;
  assignedEngineer: string | null;
  createdByDisplayName: string;
  contractStatusAtCreation: ContractStatus;
};

export const createJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: CreateJobInput) => i)
  .handler(async ({ data, context }): Promise<CreatedJob> => {
    const m = await loadMembership(context.supabase, context.userId, data.tenantId);
    const permission = data.mode === "quick" ? "create_quick_job" : "create_standard_job";
    if (!(await hasPermission(context.supabase, data.tenantId, m.role, permission))) {
      throw new Error(`Forbidden: ${permission} permission required`);
    }

    // Validate inputs
    const subject = data.subject?.trim();
    if (!subject) throw new Error("Subject is required");
    if (subject.length > 200) throw new Error("Subject too long");
    const priority = data.priority ?? "medium";

    // Load customer
    const { data: cust, error: custErr } = await context.supabase
      .from("servicehub_customers")
      .select("n3_record_id, n3_code, name")
      .eq("tenant_id", data.tenantId)
      .eq("n3_code", data.customerCode)
      .maybeSingle();
    if (custErr) throw custErr;
    if (!cust) throw new Error("Customer not found in this tenant");

    // Load contract snapshot (may be missing → unknown)
    const { data: snap } = await context.supabase
      .from("customer_contract_snapshots")
      .select("contract_status, latest_contract_document_no, expiry_date")
      .eq("tenant_id", data.tenantId)
      .eq("n3_customer_code", data.customerCode)
      .maybeSingle();
    const contractStatus: ContractStatus =
      (snap?.contract_status as ContractStatus) ?? "unknown";

    // Load approval rule for this contract status
    const { data: rule } = await context.supabase
      .from("approval_rules")
      .select("initial_job_status, approval_required")
      .eq("tenant_id", data.tenantId)
      .eq("customer_status", contractStatus)
      .maybeSingle();

    // Defaults per spec
    const defaults: Record<
      ContractStatus,
      { status: "draft" | "pending"; approvalRequired: boolean }
    > = {
      active: { status: "pending", approvalRequired: false },
      due_soon: { status: "pending", approvalRequired: false },
      overdue: { status: "draft", approvalRequired: true },
      suspended: { status: "draft", approvalRequired: true },
      unknown: { status: "draft", approvalRequired: true },
    };
    const initialStatus = (rule?.initial_job_status as "draft" | "pending") ?? defaults[contractStatus].status;
    const approvalRequired = rule?.approval_required ?? defaults[contractStatus].approvalRequired;
    const approvalStatus = approvalRequired ? "waiting_approval" : "not_required";
    const workflowStatus = approvalRequired ? "draft" : initialStatus;

    // Resolve assigned engineer (respects job_assignment_mode)
    let assignedToLocalId: string | null = null;
    let assignedN3UserId: string | null = null;
    let assignedDisplayName: string | null = null;
    let assignedType: "n3_user" | "local_user" | null = null;

    let effectiveAssigneeId: string | null = data.assignedEngineerId ?? null;
    if (!effectiveAssigneeId) {
      const { data: gs } = await context.supabase
        .from("general_settings")
        .select("job_assignment_mode")
        .eq("tenant_id", data.tenantId)
        .maybeSingle();
      const mode = (gs?.job_assignment_mode ?? "auto_assign_creator") as
        | "auto_assign_creator"
        | "leave_unassigned"
        | "select_each_time";
      if (mode === "auto_assign_creator") effectiveAssigneeId = `local:${m.id}`;
    }

    if (effectiveAssigneeId) {
      const [kind, id] = effectiveAssigneeId.split(":");
      if (kind === "local" && id) {
        const { data: lu } = await context.supabase
          .from("users_local")
          .select("id, display_name, email")
          .eq("id", id)
          .eq("tenant_id", data.tenantId)
          .eq("is_active", true)
          .maybeSingle();
        if (!lu) {
          // Do not fail creation — spec allows falling back to unassigned.
        } else {
          assignedToLocalId = lu.id;
          assignedDisplayName = lu.display_name?.trim() || lu.email;
          assignedType = "local_user";
        }
      } else if (kind === "n3" && id) {
        const { data: nu } = await context.supabase
          .from("servicehub_users")
          .select("n3_record_id, name, payload")
          .eq("tenant_id", data.tenantId)
          .eq("n3_record_id", id)
          .eq("is_active", true)
          .maybeSingle();
        if (nu) {
          assignedN3UserId = nu.n3_record_id;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = nu.payload as any;
          assignedDisplayName =
            nu.name?.trim() ||
            (p && typeof p === "object" && (p.displayName || p.fullName || p.name || p.userName)) ||
            "(unnamed)";
          assignedType = "n3_user";
        }
      }
    }

    // Insert job — job_no is generated by DB trigger tg_jobs_assign_job_no
    const insertRow = {
      tenant_id: data.tenantId,
      job_no: "", // trigger overrides
      title: subject,
      description: data.mode === "quick" ? null : data.description ?? null,
      priority,
      status: workflowStatus,
      approval_required: approvalRequired,
      approval_status: approvalStatus,
      due_date: data.mode === "quick" ? null : data.dueDate ?? null,
      internal_remark: data.mode === "quick" ? null : data.internalRemark ?? null,
      entry_mode: data.mode,
      n3_customer_code: cust.n3_code,
      n3_customer_id: cust.n3_record_id,
      n3_customer_name: cust.name,
      contract_status_at_creation: contractStatus,
      contract_document_no_at_creation: snap?.latest_contract_document_no ?? null,
      contract_expiry_at_creation: snap?.expiry_date ?? null,
      created_by: m.id,
      created_by_user_code: m.email,
      created_by_display_name: m.display_name?.trim() || m.email,
      created_by_user_type: "local_user",
      assigned_to: assignedToLocalId,
      assigned_n3_user_id: assignedN3UserId,
      assigned_engineer_display_name: assignedDisplayName,
      assigned_engineer_user_type: assignedType,
    };

    const { data: inserted, error: insErr } = await context.supabase
      .from("jobs")
      .insert(insertRow)
      .select("id, job_no, status, approval_status, approval_required")
      .single();
    if (insErr) throw insErr;

    // Attachment: move/register (assume already uploaded under {tenant}/tmp/{filename} by client)
    if (data.mode === "standard" && data.attachment) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Path convention final: {tenantId}/{jobId}/{filename}
      const finalPath = `${data.tenantId}/${inserted.id}/${data.attachment.fileName}`;
      // Move from temp path to final path
      const { error: mvErr } = await supabaseAdmin.storage
        .from("job-attachments")
        .move(data.attachment.storagePath, finalPath);
      if (mvErr && !mvErr.message?.includes("not found")) {
        // Do not fail the job for a move error; still record if source exists as-is
        console.error("attachment move failed", mvErr);
      }
      const usedPath = mvErr ? data.attachment.storagePath : finalPath;
      await supabaseAdmin.from("job_attachments").insert({
        tenant_id: data.tenantId,
        job_id: inserted.id,
        file_name: data.attachment.fileName,
        file_url: usedPath,
        uploaded_by: m.id,
      });
    }

    // Activity + notification
    await context.supabase.from("activity_logs").insert({
      tenant_id: data.tenantId,
      entity_type: "job",
      entity_id: inserted.id,
      action: approvalRequired ? "job_created_pending_approval" : "job_created",
      after_value: {
        contractStatus,
        approvalRequired,
        assignedTo: assignedDisplayName,
        mode: data.mode,
      },
      user_code: m.email,
      user_type: "local_user",
      result: "success",
    });
    if (assignedToLocalId && assignedToLocalId !== m.id) {
      await context.supabase.from("notifications").insert({
        tenant_id: data.tenantId,
        recipient_id: assignedToLocalId,
        type: "job_assigned",
        title: `Job ${inserted.job_no} assigned`,
        body: subject,
        entity_table: "jobs",
        entity_id: inserted.id,
      });
    }
    if (approvalRequired) {
      // Notify tenant admins
      const { data: admins } = await context.supabase
        .from("users_local")
        .select("id")
        .eq("tenant_id", data.tenantId)
        .in("role", ["owner", "admin"])
        .eq("is_active", true);
      for (const a of (admins ?? []) as Array<{ id: string }>) {
        if (a.id === m.id) continue;
        await context.supabase.from("notifications").insert({
          tenant_id: data.tenantId,
          recipient_id: a.id,
          type: "approval_requested",
          title: `Approval needed: ${inserted.job_no}`,
          body: subject,
          entity_table: "jobs",
          entity_id: inserted.id,
        });
      }
    }


    return {
      id: inserted.id,
      jobNo: inserted.job_no,
      workflowStatus: inserted.status,
      approvalStatus: inserted.approval_status,
      approvalRequired: inserted.approval_required,
      customerCode: cust.n3_code as string,
      customerName: cust.name,
      assignedEngineer: assignedDisplayName,
      createdByDisplayName: insertRow.created_by_display_name,
      contractStatusAtCreation: contractStatus,
    };
  });

// -------- Read-only view for the success screen / temp Job view --------

export type JobDetailView = {
  id: string;
  jobNo: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  approvalStatus: string;
  approvalRequired: boolean;
  createdAt: string;
  dueDate: string | null;
  customerCode: string | null;
  customerName: string | null;
  assignedEngineer: string | null;
  createdBy: string | null;
  contractStatusAtCreation: string | null;
  contractDocumentNoAtCreation: string | null;
  contractExpiryAtCreation: string | null;
  internalRemark: string | null;
  entryMode: string | null;
};

export const getJobDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { tenantId: string; jobId: string }) => i)
  .handler(async ({ data, context }): Promise<JobDetailView> => {
    await loadMembership(context.supabase, context.userId, data.tenantId);
    const { data: r, error } = await context.supabase
      .from("jobs")
      .select(
        "id, job_no, title, description, priority, status, approval_status, approval_required, created_at, due_date, n3_customer_code, n3_customer_name, assigned_engineer_display_name, created_by_display_name, contract_status_at_creation, contract_document_no_at_creation, contract_expiry_at_creation, internal_remark, entry_mode",
      )
      .eq("id", data.jobId)
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!r) throw new Error("Job not found");
    return {
      id: r.id,
      jobNo: r.job_no,
      title: r.title,
      description: r.description,
      priority: r.priority,
      status: r.status,
      approvalStatus: r.approval_status,
      approvalRequired: r.approval_required,
      createdAt: r.created_at,
      dueDate: r.due_date,
      customerCode: r.n3_customer_code,
      customerName: r.n3_customer_name,
      assignedEngineer: r.assigned_engineer_display_name,
      createdBy: r.created_by_display_name,
      contractStatusAtCreation: r.contract_status_at_creation,
      contractDocumentNoAtCreation: r.contract_document_no_at_creation,
      contractExpiryAtCreation: r.contract_expiry_at_creation,
      internalRemark: r.internal_remark,
      entryMode: r.entry_mode,
    };
  });
