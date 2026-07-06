/**
 * AuthService
 *
 * Wraps QNE Platform API `/api/Auth/*` endpoints:
 *  - GET  /api/Auth/ApiVer                  (Auth_ApiVer_GET)          anonymous probe
 *  - GET  /api/Auth/Connect?api-key=...     (Auth_Connect_GET)         PAT -> JWT
 *  - POST /api/Auth/Token                   (Auth_Token_POST)          username/password
 *  - POST /api/Auth/SendLogin2FAEmailCode   (Auth_SendLogin2FAEmailCode_POST)
 *  - POST /api/Auth/VerifyTwoFactor         (Auth_VerifyTwoFactor_POST)
 *  - POST /api/Auth/Refresh                 (Auth_Refresh_POST)
 *  - POST /api/Auth/Logout                  (Auth_Logout_POST)
 */

import { ConnectionManager } from "./ConnectionManager";
import type { ConnectResponse, TokenCredential } from "./types";

export class AuthService {
  constructor(private conn: ConnectionManager) {}

  /** Unauthenticated connectivity probe. Returns deployment `State`. */
  apiVer() {
    return this.conn.request<string>("/api/Auth/ApiVer", { anonymous: true });
  }

  /**
   * Exchange a My Apps API key (PAT, GUID) for a short-lived JWT.
   * Also stores the token on the ConnectionManager so subsequent calls
   * are authenticated automatically.
   */
  async connectWithApiKey(apiKey: string): Promise<ConnectResponse> {
    const data = await this.conn.request<ConnectResponse>("/api/Auth/Connect", {
      anonymous: true,
      query: { "api-key": apiKey },
    });
    if (data?.token) this.conn.setToken(data.token);
    return data;
  }

  /** Password login. May return business code `REQUIRE_MFA`. */
  async tokenLogin(credential: TokenCredential): Promise<ConnectResponse> {
    const data = await this.conn.request<ConnectResponse>("/api/Auth/Token", {
      method: "POST",
      anonymous: true,
      body: credential,
    });
    if (data?.token) this.conn.setToken(data.token);
    return data;
  }

  sendLogin2FAEmailCode(credential: TokenCredential) {
    return this.conn.request<unknown>("/api/Auth/SendLogin2FAEmailCode", {
      method: "POST",
      anonymous: true,
      body: credential,
    });
  }

  async verifyTwoFactor(payload: {
    userName: string;
    password: string;
    verificationCode: string;
    useEmailCode?: boolean;
  }): Promise<ConnectResponse> {
    const data = await this.conn.request<ConnectResponse>("/api/Auth/VerifyTwoFactor", {
      method: "POST",
      anonymous: true,
      body: payload,
    });
    if (data?.token) this.conn.setToken(data.token);
    return data;
  }

  async refresh(): Promise<ConnectResponse> {
    const data = await this.conn.request<ConnectResponse>("/api/Auth/Refresh", { method: "POST" });
    if (data?.token) this.conn.setToken(data.token);
    return data;
  }

  async logout(): Promise<void> {
    try {
      await this.conn.request<unknown>("/api/Auth/Logout", { method: "POST" });
    } finally {
      this.conn.setToken(null);
    }
  }
}
