import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  token: z.string().optional(),
  tenant: z.string().optional(),
});

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "ServiceHub for N3.QNE.Cloud" },
      {
        name: "description",
        content:
          "ServiceHub — Customer Service Management System for N3.QNE.Cloud. Jobs, renewals and delivery workflow.",
      },
      { property: "og:title", content: "ServiceHub for N3.QNE.Cloud" },
      {
        property: "og:description",
        content:
          "Customer Service Management System for N3.QNE.Cloud — jobs, renewals, delivery workflow.",
      },
    ],
  }),
  component: EntryRedirect,
});

function EntryRedirect() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/" });

  useEffect(() => {
    // If N3 launched us at "/?token=...", forward to the diagnostic handler
    // WITHOUT persisting the token anywhere. Preserved only across this
    // client-side redirect.
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
      if (cancelled) return;
      if (data.session) {
        navigate({ to: "/support", replace: true });
      } else {
        navigate({ to: "/auth", replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate, search.token, search.tenant]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Opening ServiceHub…</p>
    </main>
  );
}
