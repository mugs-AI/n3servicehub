import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyTenants } from "@/lib/support.functions";

export const Route = createFileRoute("/_authenticated/admin/dev")({
  component: AdminDevLayout,
});

function AdminDevLayout() {
  const tenantsFn = useServerFn(getMyTenants);
  const { data, isLoading } = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => tenantsFn(),
  });

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const isAdmin = (data ?? []).some((t) => t.profile === "administrator");
  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-4xl font-bold">403</h1>
        <p className="mt-2 text-lg font-semibold">Forbidden</p>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to access this area.
        </p>
        <div className="mt-6">
          <Link
            to="/support"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Support
          </Link>
        </div>
      </main>
    );
  }

  return <Outlet />;
}
