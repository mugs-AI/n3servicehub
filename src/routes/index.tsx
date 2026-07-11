import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({
  token: z.string().optional(),
  tenant: z.string().optional(),
});

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "ServiceHub — Developer Landing" },
      {
        name: "description",
        content:
          "ServiceHub for N3.QNE.Cloud — developer landing with quick access to workspace, admin tools, and diagnostics.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DevLanding,
});

function DevLanding() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/" });
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (search.token) {
      navigate({
        to: "/n3-launch",
        search: { token: search.token, tenant: search.tenant },
        replace: true,
      });
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setAuthed(!!data.session);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate, search.token, search.tenant]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Development Mode
        </p>
        <h1 className="mt-1 text-3xl font-bold">ServiceHub for N3.QNE.Cloud</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Direct landing page with links to all workspaces, admin tools, and diagnostics.
          Production users normally go straight to <code>/support</code>.
        </p>
        <div className="mt-3 text-xs text-muted-foreground">
          Auth:{" "}
          {authed === null ? "checking…" : authed ? "signed in" : "not signed in"}
          {authed === false && (
            <>
              {" — "}
              <Link to="/auth" className="underline">Sign in</Link>
            </>
          )}
        </div>
      </header>

      <Section title="Business Workspaces">
        <NavCard to="/support" title="Support Workspace" desc="Customer search, contract status, job creation." />
        <NavCard to="/jobs" title="Jobs Workspace" desc="Job list, detail, assignment and workflow actions." />
        <NavCard to="/settings" title="Settings" desc="N3 integration, renewal, ad hoc, general, access." />
      </Section>

      <Section title="Administrator Tools">
        <NavCard to="/admin/dev/sync" title="Sync Verification Console" desc="Live sync status and per-tenant counts." />
        <NavCard to="/admin/dev/status" title="System Status" desc="Routing, auth, sync, database health." />
        <NavCard to="/admin/dev/status/api" title="API Connection Status" desc="N3.QNE.Cloud SDK modules." />
      </Section>

      <Section title="Bootstrap & Launch">
        <NavCard to="/admin/dev/bootstrap" title="First Tenant Bootstrap" desc="Provision the first tenant (public when no tenant exists)." />
        <NavCard to="/admin/dev/n3-connect" title="N3 Dev Connect (Path B)" desc="Exchange N3 API key for a JWT and save it to localStorage." />
        <NavCard to="/n3-launch" title="N3 Launch Diagnostic" desc="Safely inspect ?token= handoff from N3." />
        <NavCard to="/auth" title="Local Sign In" desc="Email/password authentication." />
      </Section>

      {authed && (
        <div className="mt-8 flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/support">Go to Support</Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              setAuthed(false);
            }}
          >
            Sign out
          </Button>
        </div>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function NavCard({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="block rounded-lg border bg-card p-4 transition hover:border-primary hover:shadow-sm"
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
    </Link>
  );
}
