/**
 * InvoiceService — QNE Sales & AR API `/api/SalesInvoices/*`.
 *
 *  - GET    /api/SalesInvoices/List            (SalesInvoices_GetList_GET)      OData paged
 *  - GET    /api/SalesInvoices/{key}           (SalesInvoices_GetByKey_GET)
 *  - GET    /api/SalesInvoices/New             (SalesInvoices_New_GET)
 *  - GET    /api/SalesInvoices/RefList         (SalesInvoices_GetRefList_GET)
 *  - GET    /api/SalesInvoices/GetPaymentInfo  (SalesInvoices_GetPaymentInfo_GET)
 *  - GET    /api/SalesInvoices/GLPosting       (SalesInvoices_GetGLPosting_GET)
 *  - GET    /api/SalesInvoices/StockPosting    (SalesInvoices_StockPosting_GET)
 *  - POST   /api/SalesInvoices/Create          (SalesInvoices_Create_POST)
 *  - POST   /api/SalesInvoices/Update          (SalesInvoices_Update_POST)
 *  - POST   /api/SalesInvoices/Void            (SalesInvoices_Void_POST)
 *  - POST   /api/SalesInvoices/Devoid          (SalesInvoices_Devoid_POST)
 *  - POST   /api/SalesInvoices/ApproveBulk     (SalesInvoices_ApproveBulk_POST)
 *  - POST   /api/SalesInvoices/EInvoiceValidation
 *  - POST   /api/SalesInvoices/IsKnockedoff    (SalesInvoices_CheckIsKnockedoff_POST)
 *  - DELETE /api/SalesInvoices                 (SalesInvoices_Delete_DELETE)
 */

import { ConnectionManager } from "./ConnectionManager";
import type { ODataListQuery } from "./types";

export type N3SalesInvoice = Record<string, unknown> & { id?: string; docNo?: string };

export class InvoiceService {
  constructor(private conn: ConnectionManager) {}

  list(query: ODataListQuery = {}) {
    return this.conn.listQuery<N3SalesInvoice>("/api/SalesInvoices/List", query);
  }

  get(key: string) {
    return this.conn.request<N3SalesInvoice>(`/api/SalesInvoices/${encodeURIComponent(key)}`);
  }

  newTemplate() {
    return this.conn.request<N3SalesInvoice>("/api/SalesInvoices/New");
  }

  refList(query: ODataListQuery = {}) {
    return this.conn.listQuery<N3SalesInvoice>("/api/SalesInvoices/RefList", query);
  }

  getPaymentInfo(query: Record<string, string | number> = {}) {
    return this.conn.request<unknown>("/api/SalesInvoices/GetPaymentInfo", { query });
  }

  getGLPosting(query: Record<string, string | number> = {}) {
    return this.conn.request<unknown>("/api/SalesInvoices/GLPosting", { query });
  }

  getStockPosting(query: Record<string, string | number> = {}) {
    return this.conn.request<unknown>("/api/SalesInvoices/StockPosting", { query });
  }

  create(payload: N3SalesInvoice) {
    return this.conn.request<N3SalesInvoice>("/api/SalesInvoices/Create", { method: "POST", body: payload });
  }

  update(payload: N3SalesInvoice) {
    return this.conn.request<N3SalesInvoice>("/api/SalesInvoices/Update", { method: "POST", body: payload });
  }

  void(payload: { id: string; reason?: string } & Record<string, unknown>) {
    return this.conn.request<unknown>("/api/SalesInvoices/Void", { method: "POST", body: payload });
  }

  devoid(payload: { id: string } & Record<string, unknown>) {
    return this.conn.request<unknown>("/api/SalesInvoices/Devoid", { method: "POST", body: payload });
  }

  approveBulk(ids: string[]) {
    return this.conn.request<unknown>("/api/SalesInvoices/ApproveBulk", { method: "POST", body: ids });
  }

  eInvoiceValidation(payload: Record<string, unknown>) {
    return this.conn.request<unknown>("/api/SalesInvoices/EInvoiceValidation", { method: "POST", body: payload });
  }

  isKnockedOff(payload: { id: string } & Record<string, unknown>) {
    return this.conn.request<boolean>("/api/SalesInvoices/IsKnockedoff", { method: "POST", body: payload });
  }

  remove(ids: string[]) {
    return this.conn.request<unknown>("/api/SalesInvoices", { method: "DELETE", body: ids });
  }
}
