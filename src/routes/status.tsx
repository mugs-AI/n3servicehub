import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "System Status — ServiceHub" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  const items = [
    { label: "Routing", ok: true },
    { label: "Authentication", ok: true },
    { label: "Synchronization Layer", ok: true },
    { label: "Database", ok: true },
  ];

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">System Status</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Temporary developer view. Detailed diagnostics arrive in Milestone 2.
      </p>
      <ul className="mt-6 divide-y rounded-md border bg-card">
        {items.map((i) => (
          <li key={i.label} className="flex items-center justify-between px-4 py-3">
            <span className="font-medium">{i.label}</span>
            <span
              className={
                i.ok
                  ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                  : "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
              }
            >
              {i.ok ? "OK" : "Down"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
