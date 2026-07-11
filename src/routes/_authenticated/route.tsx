import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMyTenants } from "@/lib/support.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.href, reason: "auth_required" as const },
      });
    }
    return { user: data.user };
  },
  component: AuthenticatedShell,
});

function AuthenticatedShell() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <Outlet />
    </div>
  );
}

function TopNav() {
  const tenantsFn = useServerFn(getMyTenants);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data } = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => tenantsFn(),
    staleTime: 60_000,
  });

  const isAdmin = (data ?? []).some((t) => t.profile === "administrator");

  const items: Array<{ to: string; label: string; match?: (p: string) => boolean }> = [
    { to: "/support", label: "Support" },
    { to: "/jobs", label: "Jobs", match: (p) => p === "/jobs" || p.startsWith("/jobs/") },
    { to: "/settings", label: "Settings" },
  ];

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link to="/support" className="text-base font-semibold tracking-tight">
          ServiceHub
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {items.map((it) => {
            const active = it.match ? it.match(pathname) : pathname === it.to || pathname.startsWith(it.to + "/");
            return (
              <Link
                key={it.to}
                to={it.to}
                className={
                  "rounded-md px-3 py-1.5 font-medium transition-colors " +
                  (active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")
                }
              >
                {it.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              to="/admin/dev/sync"
              className={
                "rounded-md px-3 py-1.5 font-medium transition-colors " +
                (pathname.startsWith("/admin/dev")
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")
              }
            >
              Admin Tools
            </Link>
          )}
        </nav>
        <div className="ml-auto">
          <button
            onClick={handleSignOut}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
