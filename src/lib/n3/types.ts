/**
 * N3.QNE.Cloud OpenAPI shared types.
 * Source: https://openapi.account.qne.cloud/doc/index.html
 *
 * All JSON APIs use an ApiResponse envelope (`code`, `message`, `data`).
 * Success code is `"0000"`. Paginated GET list/search endpoints return
 * PageQueryResult in `data`: rows in `data.value`, total in `data.count`.
 */

export type ApiResponse<T = unknown> = {
  code: string;
  message?: string | null;
  data: T;
};

export type PageQueryResult<T> = {
  value: T[];
  count: number;
};

export type ODataListQuery = {
  $top?: number;
  $skip?: number;
  $filter?: string;
  $orderby?: string;
  $select?: string;
  $expand?: string;
};

export type ConnectResponse = {
  token: string;
  company?: string;
  tenantCode?: string;
  email?: string;
  expiresAt?: string;
};

export type TokenCredential = {
  userName: string;
  password: string;
  isUnlock?: boolean;
};

export class N3ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public raw?: unknown,
  ) {
    super(`[N3 ${code}] ${message}`);
    this.name = "N3ApiError";
  }
}
