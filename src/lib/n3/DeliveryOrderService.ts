/**
 * DeliveryOrderService — QNE Sales & AR API `/api/DeliveryOrders/*`.
 *
 *  - GET    /api/DeliveryOrders/List            (DeliveryOrders_GetList_GET)      OData paged
 *  - GET    /api/DeliveryOrders/{key}           (DeliveryOrders_GetByKey_GET)
 *  - GET    /api/DeliveryOrders/New             (DeliveryOrders_New_GET)
 *  - GET    /api/DeliveryOrders/Query           (DeliveryOrders_Query_GET)
 *  - GET    /api/DeliveryOrders/StockPosting    (DeliveryOrders_StockPosting_GET)
 *  - POST   /api/DeliveryOrders/Create          (DeliveryOrders_Create_POST)
 *  - POST   /api/DeliveryOrders/Update          (DeliveryOrders_Update_POST)
 *  - POST   /api/DeliveryOrders/Close           (DeliveryOrders_Close_POST)
 *  - POST   /api/DeliveryOrders/ReOpen          (DeliveryOrders_ReOpen_POST)
 *  - POST   /api/DeliveryOrders/Void            (DeliveryOrders_Void_POST)
 *  - POST   /api/DeliveryOrders/Devoid          (DeliveryOrders_Devoid_POST)
 *  - DELETE /api/DeliveryOrders                 (DeliveryOrders_Delete_DELETE)
 */

import { ConnectionManager } from "./ConnectionManager";
import type { ODataListQuery } from "./types";

export type N3DeliveryOrder = Record<string, unknown> & { id?: string; docNo?: string };

export class DeliveryOrderService {
  constructor(private conn: ConnectionManager) {}

  list(query: ODataListQuery = {}) {
    return this.conn.listQuery<N3DeliveryOrder>("/api/DeliveryOrders/List", query);
  }

  get(key: string) {
    return this.conn.request<N3DeliveryOrder>(`/api/DeliveryOrders/${encodeURIComponent(key)}`);
  }

  newTemplate() {
    return this.conn.request<N3DeliveryOrder>("/api/DeliveryOrders/New");
  }

  query(query: ODataListQuery = {}) {
    return this.conn.listQuery<N3DeliveryOrder>("/api/DeliveryOrders/Query", query);
  }

  getStockPosting(query: Record<string, string | number> = {}) {
    return this.conn.request<unknown>("/api/DeliveryOrders/StockPosting", { query });
  }

  create(payload: N3DeliveryOrder) {
    return this.conn.request<N3DeliveryOrder>("/api/DeliveryOrders/Create", { method: "POST", body: payload });
  }

  update(payload: N3DeliveryOrder) {
    return this.conn.request<N3DeliveryOrder>("/api/DeliveryOrders/Update", { method: "POST", body: payload });
  }

  close(payload: { id: string } & Record<string, unknown>) {
    return this.conn.request<unknown>("/api/DeliveryOrders/Close", { method: "POST", body: payload });
  }

  reopen(payload: { id: string } & Record<string, unknown>) {
    return this.conn.request<unknown>("/api/DeliveryOrders/ReOpen", { method: "POST", body: payload });
  }

  void(payload: { id: string; reason?: string } & Record<string, unknown>) {
    return this.conn.request<unknown>("/api/DeliveryOrders/Void", { method: "POST", body: payload });
  }

  devoid(payload: { id: string } & Record<string, unknown>) {
    return this.conn.request<unknown>("/api/DeliveryOrders/Devoid", { method: "POST", body: payload });
  }

  remove(ids: string[]) {
    return this.conn.request<unknown>("/api/DeliveryOrders", { method: "DELETE", body: ids });
  }
}
