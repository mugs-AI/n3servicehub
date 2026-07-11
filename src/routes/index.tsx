import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
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
  useEffect(() => {
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
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Opening ServiceHub…</p>
    </main>
  );
}
