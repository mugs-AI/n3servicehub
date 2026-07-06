/**
 * RoleService
 *
 * The N3 QNE Platform OpenAPI does NOT publish a dedicated `/api/Roles`
 * controller. Role management is exposed exclusively as attach/detach
 * operations on the Users controller:
 *
 *  - POST /api/Users/AttachRole   (Users_AttachRole_POST)
 *  - POST /api/Users/DetachRole   (Users_DetachRole_POST)
 *
 * This service wraps those endpoints and centralizes any future role
 * enumeration (e.g. via UserData / TenantData) so ServiceHub code can
 * import a single RoleService abstraction.
 *
 * If a role catalogue endpoint is added upstream, extend `listRoles`
 * here — do not re-invent placeholder APIs in feature code.
 */

import { ConnectionManager } from "./ConnectionManager";
import { N3ApiError } from "./types";

export type N3Role = Record<string, unknown> & { id?: string; name?: string };

export class RoleService {
  constructor(private conn: ConnectionManager) {}

  attachRole(payload: { userId: string; roleId: string } & Record<string, unknown>) {
    return this.conn.request<unknown>("/api/Users/AttachRole", { method: "POST", body: payload });
  }

  detachRole(payload: { userId: string; roleId: string } & Record<string, unknown>) {
    return this.conn.request<unknown>("/api/Users/DetachRole", { method: "POST", body: payload });
  }

  /**
   * Placeholder for a future role catalogue endpoint. The public
   * OpenAPI (platform-v1) currently does not expose a role listing
   * endpoint, so this method throws to make missing capability explicit
   * rather than returning fabricated data.
   */
  listRoles(): Promise<N3Role[]> {
    throw new N3ApiError(
      "NOT_AVAILABLE",
      "N3 Platform OpenAPI does not expose a role catalogue endpoint. Roles are managed via Users_AttachRole_POST / Users_DetachRole_POST.",
      501,
    );
  }
}
