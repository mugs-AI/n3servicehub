/**
 * StockService — QNE Inventory API `/api/Stocks/*` (scope: stock-v1).
 *
 *  - GET    /api/Stocks/List              (Stocks_GetList_GET)         OData paged
 *  - GET    /api/Stocks/DetailedList      (Stocks_GetDetailedList_GET)
 *  - GET    /api/Stocks/{id}              (Stocks_Get_GET)
 *  - GET    /api/Stocks/BarCode           (Stocks_GetByBarcode_GET)
 *  - GET    /api/Stocks/New               (Stocks_New_GET)
 *  - GET    /api/Stocks/UpdateList        (Stocks_GetUpdateList_GET)
 *  - POST   /api/Stocks/Create            (Stocks_Create_POST)
 *  - POST   /api/Stocks/Update            (Stocks_Update_POST)
 *  - POST   /api/Stocks/BatchUpdate       (Stocks_BatchUpdate_POST)
 *  - POST   /api/Stocks/SetActive         (Stocks_SetActive_POST)
 *  - POST   /api/Stocks/SetInactive       (Stocks_SetInactive_POST)
 *  - DELETE /api/Stocks                   (Stocks_Delete_DELETE)
 */

import { ConnectionManager } from "./ConnectionManager";
import type { ODataListQuery } from "./types";

export type N3Stock = Record<string, unknown> & { id?: string; code?: string; description?: string };

export class StockService {
  constructor(private conn: ConnectionManager) {}

  list(query: ODataListQuery = {}) {
    return this.conn.listQuery<N3Stock>("/api/Stocks/List", query);
  }

  detailedList(query: ODataListQuery = {}) {
    return this.conn.listQuery<N3Stock>("/api/Stocks/DetailedList", query);
  }

  get(id: string) {
    return this.conn.request<N3Stock>(`/api/Stocks/${encodeURIComponent(id)}`);
  }

  getByBarcode(barcode: string) {
    return this.conn.request<N3Stock>("/api/Stocks/BarCode", { query: { barcode } });
  }

  newTemplate() {
    return this.conn.request<N3Stock>("/api/Stocks/New");
  }

  create(payload: N3Stock) {
    return this.conn.request<N3Stock>("/api/Stocks/Create", { method: "POST", body: payload });
  }

  update(payload: N3Stock) {
    return this.conn.request<N3Stock>("/api/Stocks/Update", { method: "POST", body: payload });
  }

  batchUpdate(payload: N3Stock[]) {
    return this.conn.request<unknown>("/api/Stocks/BatchUpdate", { method: "POST", body: payload });
  }

  setActive(ids: string[]) {
    return this.conn.request<unknown>("/api/Stocks/SetActive", { method: "POST", body: ids });
  }

  setInactive(ids: string[]) {
    return this.conn.request<unknown>("/api/Stocks/SetInactive", { method: "POST", body: ids });
  }

  remove(ids: string[]) {
    return this.conn.request<unknown>("/api/Stocks", { method: "DELETE", body: ids });
  }
}
