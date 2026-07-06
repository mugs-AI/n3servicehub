/**
 * ServiceHub — N3.QNE.Cloud OpenAPI SDK (Milestone 0).
 *
 * SERVER-ONLY facade. Instantiate one `N3Client` per authenticated
 * session and call `client.auth.connectWithApiKey(...)` (My Apps PAT)
 * or `client.auth.tokenLogin(...)` (username / password) before using
 * the other services. All services share a single ConnectionManager,
 * so the JWT set by AuthService is automatically applied to every
 * subsequent request.
 *
 * Reference: https://openapi.account.qne.cloud/doc/index.html
 */

import { ConnectionManager, type N3ConnectionConfig } from "./ConnectionManager";
import { AuthService } from "./AuthService";
import { CustomerService } from "./CustomerService";
import { StockService } from "./StockService";
import { InvoiceService } from "./InvoiceService";
import { DeliveryOrderService } from "./DeliveryOrderService";
import { N3UserService } from "./N3UserService";
import { RoleService } from "./RoleService";

export {
  ConnectionManager,
  AuthService,
  CustomerService,
  StockService,
  InvoiceService,
  DeliveryOrderService,
  N3UserService,
  RoleService,
};
export * from "./types";

export class N3Client {
  readonly connection: ConnectionManager;
  readonly auth: AuthService;
  readonly customers: CustomerService;
  readonly stocks: StockService;
  readonly invoices: InvoiceService;
  readonly deliveryOrders: DeliveryOrderService;
  readonly users: N3UserService;
  readonly roles: RoleService;

  constructor(config: N3ConnectionConfig = {}) {
    this.connection = new ConnectionManager(config);
    this.auth = new AuthService(this.connection);
    this.customers = new CustomerService(this.connection);
    this.stocks = new StockService(this.connection);
    this.invoices = new InvoiceService(this.connection);
    this.deliveryOrders = new DeliveryOrderService(this.connection);
    this.users = new N3UserService(this.connection);
    this.roles = new RoleService(this.connection);
  }
}
