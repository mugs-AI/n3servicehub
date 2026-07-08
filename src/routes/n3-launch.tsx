import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

/**
 * N3 Embedded Launch entry point (Mode A).
 *
 * Reserved endpoint for N3.QNE.Cloud to launch ServiceHub with a signed
 * token. Validation + tenant resolution + session mint will be implemented
 * in a later milestone; for now we only reserve the route so the URL shape
 * is stable and callers don't hit the local login page.
 *
 * Expected: /n3-launch?token=<signed-jwt>&tenant=<n3_tenant_code>
 */

const searchSchema = z.object({
  token: z.string().optional(),
  tenant: z.string().optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/n3-launch")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "N3 Launch — ServiceHub" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: N3LaunchPage,
});

function N3LaunchPage() {
  const search = useSearch({ from: "/n3-launch" });
  const navigate = useNavigate();
  const [message, setMessage] = useState("Validating N3 launch token…");

  useEffect(() => {
    if (!search.token) {
      setMessage(
        "This URL is reserved for N3.QNE.Cloud embedded launch. No token was provided.",
      );
      return;
    }
    // TODO(milestone-2): validate token, resolve tenant, mint Supabase session,
    // then navigate to the target dashboard.
    setMessage(
      "N3 embedded launch received. Token validation is not yet implemented in this milestone.",
    );
    // Intentionally do NOT redirect: prevents accidental bounce to login page.
    void navigate;
  }, [search.token, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">ServiceHub — N3 Launch</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}
