/**
 * ConnectionManager
 *
 * Owns the low-level HTTP transport to the N3.QNE.Cloud OpenAPI
 * (https://openapi.account.qne.cloud). Every ServiceHub service goes
 * through this manager so we have a single place for base URL, headers,
 * bearer-token injection, envelope unwrapping and error normalization.
 *
 * SERVER-ONLY. Do not import from browser bundles: the JWT and API key
 * must never leave the server runtime.
 */

import { N3ApiError, type ApiResponse, type ODataListQuery } from "./types";

export type N3ConnectionConfig = {
  /**
   * Base URL for the QNE Open API. Defaults to the production host
   * documented in the swagger spec.
   */
  baseUrl?: string;
  /**
   * JWT access token returned from AuthService (Bearer).
   */
  token?: string | null;
  /**
   * Optional fetch implementation (for tests / SSR runtimes).
   */
  fetchImpl?: typeof fetch;
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /**
   * When true, skips the ApiResponse envelope unwrap and returns the raw
   * parsed JSON (used for endpoints marked `x-qne-envelope: unwrapped`).
   */
  unwrapped?: boolean;
  /**
   * When true, does not attach the Authorization header (used for
   * `/api/Auth/Connect` and `/api/Auth/Token`).
   */
  anonymous?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

const DEFAULT_BASE_URL = "https://openapi.account.qne.cloud";
const SUCCESS_CODE = "0000";

export class ConnectionManager {
  private baseUrl: string;
  private token: string | null;
  private fetchImpl: typeof fetch;

  constructor(config: N3ConnectionConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.token = config.token ?? null;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Perform a request and return the envelope's `data` field on success.
   * Throws N3ApiError on transport failure or non-`0000` business codes.
   */
  async request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    const method = opts.method ?? "GET";
    const url = this.buildUrl(path, opts.query);

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(opts.headers ?? {}),
    };
    if (opts.body !== undefined && !(opts.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    if (!opts.anonymous && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: this.serializeBody(opts.body),
        signal: opts.signal,
      });
    } catch (err) {
      throw new N3ApiError(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Network request failed",
        0,
        err,
      );
    }

    const raw = await this.parseResponse(response);

    if (opts.unwrapped) {
      if (!response.ok) {
        throw new N3ApiError(
          `HTTP_${response.status}`,
          typeof raw === "string" ? raw : (raw as { message?: string })?.message ?? response.statusText,
          response.status,
          raw,
        );
      }
      return raw as T;
    }

    // ApiResponse envelope
    if (raw && typeof raw === "object" && "code" in raw) {
      const envelope = raw as ApiResponse<T>;
      if (envelope.code !== SUCCESS_CODE) {
        throw new N3ApiError(
          envelope.code,
          envelope.message ?? "N3 API returned an error",
          response.status,
          envelope,
        );
      }
      return envelope.data;
    }

    if (!response.ok) {
      throw new N3ApiError(
        `HTTP_${response.status}`,
        response.statusText,
        response.status,
        raw,
      );
    }
    return raw as T;
  }

  /** Convenience: OData list query returning `{ value, count }`. */
  listQuery<T>(path: string, query: ODataListQuery = {}) {
    return this.request<{ value: T[]; count: number }>(path, { query: query as Record<string, string | number> });
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const base = path.startsWith("http") ? path : `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    if (!query) return base;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      params.append(k, String(v));
    }
    const qs = params.toString();
    return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
  }

  private serializeBody(body: unknown): BodyInit | undefined {
    if (body === undefined || body === null) return undefined;
    if (body instanceof FormData) return body;
    if (typeof body === "string") return body;
    return JSON.stringify(body);
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const ct = response.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }
    return await response.text();
  }
}
