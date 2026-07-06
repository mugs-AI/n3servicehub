/**
 * N3UserService — QNE Platform API `/api/Users/*`.
 *
 *  - GET  /api/Users                          (Users_GetUsers_GET)
 *  - GET  /api/Users/{id}                     (Users_GetById_GET)
 *  - GET  /api/Users/Lookup                   (Users_GetLookupList_GET)
 *  - GET  /api/Users/SimpleLookup             (Users_GetSimpleLookupList_GET)
 *  - GET  /api/Users/GetAccountants           (Users_GetAccountants_GET)
 *  - GET  /api/Users/GetSupports              (Users_GetSupports_GET)
 *  - GET  /api/Users/users-in-company         (Users_GetAllUsersInCompany_GET)
 *  - POST /api/Users/GetUsersInCompany        (Users_GetUsersInCompany_POST)
 *  - POST /api/Users/Invite                   (Users_Invite_POST)
 *  - POST /api/Users/InviteAccountant         (Users_InviteAccountant_POST)
 *  - POST /api/Users/InviteQNESupport         (Users_InviteQNESupport_POST)
 *  - POST /api/Users/Reinvite                 (Users_Reinvite_POST)
 *  - POST /api/Users/Deactivate               (Users_Deactivate_POST)
 *  - POST /api/Users/ValidateAccountant       (Users_ValidateAccountant_POST)
 */

import { ConnectionManager } from "./ConnectionManager";

export type N3User = Record<string, unknown> & { id?: string; email?: string; name?: string };

export class N3UserService {
  constructor(private conn: ConnectionManager) {}

  list() {
    return this.conn.request<N3User[]>("/api/Users");
  }

  get(id: string) {
    return this.conn.request<N3User>(`/api/Users/${encodeURIComponent(id)}`);
  }

  lookup() {
    return this.conn.request<N3User[]>("/api/Users/Lookup");
  }

  simpleLookup() {
    return this.conn.request<N3User[]>("/api/Users/SimpleLookup");
  }

  getAccountants() {
    return this.conn.request<N3User[]>("/api/Users/GetAccountants");
  }

  getSupports() {
    return this.conn.request<N3User[]>("/api/Users/GetSupports");
  }

  usersInCompany() {
    return this.conn.request<N3User[]>("/api/Users/users-in-company");
  }

  getUsersInCompany(payload: Record<string, unknown>) {
    return this.conn.request<N3User[]>("/api/Users/GetUsersInCompany", { method: "POST", body: payload });
  }

  invite(payload: { email: string; roleIds?: string[]; name?: string } & Record<string, unknown>) {
    return this.conn.request<unknown>("/api/Users/Invite", { method: "POST", body: payload });
  }

  reinvite(payload: { userId: string } & Record<string, unknown>) {
    return this.conn.request<unknown>("/api/Users/Reinvite", { method: "POST", body: payload });
  }

  deactivate(payload: { userId: string } & Record<string, unknown>) {
    return this.conn.request<unknown>("/api/Users/Deactivate", { method: "POST", body: payload });
  }
}
