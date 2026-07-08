import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/status/api")({
  head: () => ({
    meta: [
      { title: "API Connection Status — ServiceHub" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApiStatusPage,
});

function ApiStatusPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">API Connection Status</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Temporary developer view of upstream N3.QNE.Cloud API reachability.
        Live per-tenant probes arrive in Milestone 2. For live sync run
        results, use the{" "}
        <Link to="/admin/sync" className="underline">
          Administrator Verification Console
        </Link>
        .
      </p>

      <div className="mt-6 rounded-md border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          N3 SDK Modules
        </h2>
        <ul className="mt-3 space-y-1 text-sm">
          <li>AuthService — reserved</li>
          <li>CustomerService — reserved</li>
          <li>StockService — reserved</li>
          <li>InvoiceService — reserved</li>
          <li>DeliveryOrderService — reserved</li>
          <li>N3UserService — reserved</li>
          <li>RoleService — reserved</li>
        </ul>
      </div>
    </main>
  );
}
