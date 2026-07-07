/**
 * Sync scheduler tick endpoint.
 *
 * Called by pg_cron every few minutes with the Supabase publishable key
 * in the `apikey` header. For every tenant it runs the SyncManager,
 * which itself only executes entities whose `sync_schedules.next_due_at`
 * has elapsed. Safe to invoke more frequently than the shortest entity
 * interval; the schedule table does the throttling.
 *
 * This route is under `/api/public/*` so it bypasses the platform auth
 * gate — we authenticate the caller manually with the anon apikey.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey");
        if (!anonKey || !provided || provided !== anonKey) {
          return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { "content-type": "application/json" } },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { SyncManager } = await import("@/lib/n3/sync/SyncManager.server");

        // Iterate every active tenant. Sync only runs for entities that
        // are actually due, so this is safe to call frequently.
        const { data: tenants, error } = await supabaseAdmin
          .from("tenants")
          .select("id")
          .eq("status", "active");
        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }

        const mgr = new SyncManager(supabaseAdmin);
        const summary: Array<{ tenantId: string; outcomes: unknown[]; error?: string }> = [];
        for (const t of tenants ?? []) {
          try {
            const outcomes = await mgr.runDueForTenant(t.id);
            if (outcomes.length > 0) summary.push({ tenantId: t.id, outcomes });
          } catch (err) {
            summary.push({
              tenantId: t.id,
              outcomes: [],
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        return new Response(
          JSON.stringify({ ok: true, tenants: (tenants ?? []).length, ran: summary }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
