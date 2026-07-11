import { createServerFn } from "@tanstack/react-start";

/**
 * Path B (dev-only) N3 connect proxy.
 *
 * The browser must NOT call https://openapi.account.qne.cloud/api/auth/connect
 * directly (CORS). This server function performs the exchange server-side and
 * returns the access token to the caller, which then persists it in
 * localStorage under the shared key used by Path A.
 *
 * Guarded by NODE_ENV: rejects in production builds.
 */
export const n3DevConnect = createServerFn({ method: "POST" })
  .inputValidator((input: { apiKey: string }) => {
    if (!input || typeof input.apiKey !== "string" || input.apiKey.trim().length === 0) {
      throw new Error("apiKey is required");
    }
    return { apiKey: input.apiKey.trim() };
  })
  .handler(async ({ data }) => {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Dev connect is disabled in production");
    }
    const base = process.env.OPEN_API_BASE_URL ?? "https://openapi.account.qne.cloud";
    const url = `${base}/api/auth/connect?api-key=${encodeURIComponent(data.apiKey)}`;

    const res = await fetch(url, { method: "GET" });
    const rawBody = await res.text();
    let parsed: { code?: string | number; data?: { token?: string; expiresAt?: string } } | null = null;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      return {
        ok: false as const,
        status: res.status,
        error: `N3 connect failed (${res.status})`,
        rawBody: rawBody.slice(0, 2000),
        token: null,
        expiresAt: null,
      };
    }

    const token = parsed?.data?.token ?? null;
    if (!token) {
      return {
        ok: false as const,
        status: res.status,
        error: "N3 connect response did not include data.token",
        rawBody: rawBody.slice(0, 2000),
        token: null,
        expiresAt: null,
      };
    }

    return {
      ok: true as const,
      status: res.status,
      token,
      expiresAt: parsed?.data?.expiresAt ?? null,
      rawBody: "",
      error: "",
    };
  });
