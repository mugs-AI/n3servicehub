import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { n3DevConnect } from "@/lib/n3-auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const TOKEN_STORAGE_KEY = "n3_access_token";
const TOKEN_META_KEY = "n3_access_token_meta";

export const Route = createFileRoute("/admin/dev/n3-connect")({
  head: () => ({
    meta: [
      { title: "N3 Dev Connect · ServiceHub" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DevConnectPage,
});

function DevConnectPage() {
  const connect = useServerFn(n3DevConnect);
  const isDev = import.meta.env.DEV;

  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { kind: "idle" }
    | { kind: "ok"; expiresAt: string | null }
    | { kind: "err"; message: string; raw?: string }
  >({ kind: "idle" });

  const existing = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null;

  if (!isDev) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <Alert variant="destructive">
          <AlertTitle>Disabled in production</AlertTitle>
          <AlertDescription>
            Path B dev connect is only available in development builds. In production, launch the app
            from N3 &ldquo;My Apps&rdquo; so the JWT arrives via <code>?token=...</code>.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult({ kind: "idle" });
    try {
      const res = await connect({ data: { apiKey } });
      if (res.ok && res.token) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
        window.localStorage.setItem(
          TOKEN_META_KEY,
          JSON.stringify({ expiresAt: res.expiresAt, savedAt: new Date().toISOString(), source: "dev" }),
        );
        setResult({ kind: "ok", expiresAt: res.expiresAt });
      } else {
        setResult({ kind: "err", message: res.error || "Unknown error", raw: res.rawBody });
      }
    } catch (err) {
      setResult({ kind: "err", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  function onClear() {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(TOKEN_META_KEY);
    setResult({ kind: "idle" });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">N3 Dev Connect (Path B)</h1>
        <p className="text-sm text-muted-foreground">
          Development-only. Exchanges an N3 API key for a JWT via the backend proxy and stores it in{" "}
          <code>localStorage["{TOKEN_STORAGE_KEY}"]</code>. Disabled in production builds.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Exchange API key</CardTitle>
          <CardDescription>
            The browser never calls N3 directly. This form posts to the server function{" "}
            <code>n3DevConnect</code>, which calls <code>GET /api/auth/connect</code> on N3 Open API
            and returns <code>data.token</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apikey">N3 API Key</Label>
              <Input
                id="apikey"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste the API key from N3 My Apps"
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || apiKey.trim().length === 0}>
                {busy ? "Connecting…" : "Connect & save token"}
              </Button>
              <Button type="button" variant="outline" onClick={onClear} disabled={busy}>
                Clear stored token
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {result.kind === "ok" && (
        <Alert>
          <AlertTitle>Connected</AlertTitle>
          <AlertDescription>
            Access token saved to localStorage. Expires: {result.expiresAt ?? "(not provided)"}.
          </AlertDescription>
        </Alert>
      )}

      {result.kind === "err" && (
        <Alert variant="destructive">
          <AlertTitle>Connect failed</AlertTitle>
          <AlertDescription className="space-y-2">
            <div>{result.message}</div>
            {result.raw ? (
              <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs">{result.raw}</pre>
            ) : null}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Current stored token</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {existing ? (
            <>
              A token is present in <code>localStorage["{TOKEN_STORAGE_KEY}"]</code> (length{" "}
              {existing.length}). Value is not displayed.
            </>
          ) : (
            <>No token stored.</>
          )}
        </CardContent>
      </Card>

      <div className="text-sm">
        <Link to="/" className="underline">
          ← Back to dev landing
        </Link>
      </div>
    </div>
  );
}
