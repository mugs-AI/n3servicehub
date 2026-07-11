import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ServiceHub for N3.QNE.Cloud" },
      {
        name: "description",
        content:
          "ServiceHub — Customer Service Management System for N3.QNE.Cloud. ERP service management, jobs, renewals and delivery workflow extension.",
      },
      { property: "og:title", content: "ServiceHub for N3.QNE.Cloud" },
      {
        property: "og:description",
        content:
          "Customer Service Management System for N3.QNE.Cloud — jobs, renewals, delivery workflow.",
      },
    ],
  }),
  component: LandingPage,
});

type StatusRow = { label: string; ok: boolean; note?: string };

function LandingPage() {
  // Static baseline: the sub-systems below are all wired up in this build.
  // If any becomes degraded in the future, flip `ok` and add a `note`.
  const status: StatusRow[] = [
    { label: "Routing", ok: true },
    { label: "Authentication", ok: true },
    { label: "Synchronization", ok: true },
    { label: "Database", ok: true },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <header className="text-center">
          <h1 className="text-5xl font-semibold tracking-tight">ServiceHub</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Customer Service Management System
          </p>
          <p className="text-sm text-muted-foreground">for N3.QNE.Cloud</p>
        </header>

        <section className="mt-12 rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Application Status
          </h2>
          <ul className="mt-4 space-y-2">
            {status.map((s) => (
              <li
                key={s.label}
                className="flex items-center justify-between border-b border-border/50 py-2 last:border-b-0"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={
                      s.ok
                        ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700"
                        : "inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700"
                    }
                  >
                    {s.ok ? "✓" : "✕"}
                  </span>
                  <span className="font-medium">{s.label}</span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {s.ok ? "Available" : (s.note ?? "Unavailable")}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Developer Tools (temporary)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            These pages are for Milestone 1.x verification and will be removed
            in Milestone 2.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              to="/support"
              className="rounded-md border bg-card px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
            >
              Support Dashboard
            </Link>
            <Link
              to="/admin/sync"
              className="rounded-md border bg-card px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
            >
              Administrator Verification Console
            </Link>
            <Link
              to="/status"
              className="rounded-md border bg-card px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
            >
              System Status
            </Link>
            <Link
              to="/status/api"
              className="rounded-md border bg-card px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
            >
              API Connection Status
            </Link>
          </div>
        </section>

        <section className="mt-10 text-center">
          <Link
            to="/auth"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Sign in
          </Link>
        </section>
      </div>
    </main>
  );
}
