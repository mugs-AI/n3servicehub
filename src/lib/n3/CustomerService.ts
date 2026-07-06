/**
 * CustomerService — QNE Sales & AR API `/api/Customers/*`.
 *
 *  - GET    /api/Customers/List           (Customers_GetList_GET)      OData paged
 *  - GET    /api/Customers/{id}           (Customers_Get_GET)
 *  - GET    /api/Customers/New            (Customers_New_GET)          template row
 *  - GET    /api/Customers/UpdateList     (Customers_GetUpdateList_GET)
 *  - POST   /api/Customers/Create         (Customers_Create_POST)
 *  - POST   /api/Customers/Update         (Customers_Update_POST)
 *  - POST   /api/Customers/GetBalances    (Customers_GetBalances_POST)
 *  - DELETE /api/Customers                (Customers_Delete_DELETE)
 */

import { ConnectionManager } from "./ConnectionManager";
import type { ODataListQuery, PageQueryResult } from "./types";

export type N3Customer = Record<string, unknown> & { id?: string; code?: string; name?: string };

export class CustomerService {
  constructor(private conn: ConnectionManager) {}

  list(query: ODataListQuery = {}) {
    return this.conn.listQuery<N3Customer>("/api/Customers/List", query);
  }

  get(id: string) {
    return this.conn.request<N3Customer>(`/api/Customers/${encodeURIComponent(id)}`);
  }

  newTemplate() {
    return this.conn.request<N3Customer>("/api/Customers/New");
  }

  updateList(query: ODataListQuery = {}) {
    return this.conn.request<PageQueryResult<N3Customer>>("/api/Customers/UpdateList", { query: query as Record<string, string | number> });
  }

  create(payload: N3Customer) {
    return this.conn.request<N3Customer>("/api/Customers/Create", { method: "POST", body: payload });
  }

  update(payload: N3Customer) {
    return this.conn.request<N3Customer>("/api/Customers/Update", { method: "POST", body: payload });
  }

  getBalances(payload: { customerIds?: string[]; asOfDate?: string } & Record<string, unknown>) {
    return this.conn.request<unknown>("/api/Customers/GetBalances", { method: "POST", body: payload });
  }

  remove(ids: string[]) {
    return this.conn.request<unknown>("/api/Customers", { method: "DELETE", body: ids });
  }
}
