import type { QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../postgres/pool.js";
import type { ApplicationRoleCode } from "./applicationUserRepository.js";

export const permissionScopes = ["GLOBAL", "BRANCH", "OWN"] as const;
export type PermissionScope = (typeof permissionScopes)[number];

export const permissionCodes = [
  "user.read",
  "staff_account.create",
  "role_assignment.approve",
  "role_definition.configure",
  "audit.read",
  "audit.export",
  "attachment.read",
  "attachment.create",
  "attachment.download",
  "attachment.update",
  "attachment.delete",
  "appointment.list",
  "appointment.read",
  "appointment.patient_lookup",
  "appointment.create",
  "appointment.update",
  "appointment.confirm",
  "appointment.reschedule",
  "appointment.cancel",
  "appointment.check_in",
  "appointment.start",
  "appointment.complete",
  "appointment.no_show",
  "patient.list",
  "patient.read",
  "patient.create",
  "patient.demographics.update",
  "treatment.read",
  "treatment.internal_notes.read",
  "treatment.finalize"
] as const;

export type PermissionCode = (typeof permissionCodes)[number];

export interface PermissionGrant {
  code: PermissionCode;
  scope: PermissionScope;
}

export interface AuthorizationRepository {
  listEffectivePermissionGrants(roleCodes: readonly ApplicationRoleCode[]): Promise<PermissionGrant[]>;
}

interface PermissionGrantRow extends QueryResultRow {
  code: unknown;
  scope: unknown;
}

const allowedPermissionCodes = new Set<PermissionCode>(permissionCodes);
const allowedPermissionScopes = new Set<PermissionScope>(permissionScopes);

function requirePermissionCode(value: unknown): PermissionCode {
  if (typeof value !== "string" || !allowedPermissionCodes.has(value as PermissionCode)) {
    throw new Error("Invalid authorization database field: permission.code");
  }
  return value as PermissionCode;
}

function requirePermissionScope(value: unknown): PermissionScope {
  if (typeof value !== "string" || !allowedPermissionScopes.has(value as PermissionScope)) {
    throw new Error("Invalid authorization database field: permission.scope");
  }
  return value as PermissionScope;
}

function mapPermissionGrantRow(row: PermissionGrantRow): PermissionGrant {
  return {
    code: requirePermissionCode(row.code),
    scope: requirePermissionScope(row.scope)
  };
}

export function createAuthorizationRepository(executor: PgQueryExecutor): AuthorizationRepository {
  return {
    async listEffectivePermissionGrants(roleCodes) {
      if (roleCodes.length === 0) return [];

      const result = await executor.query<PermissionGrantRow>(
        `SELECT DISTINCT p.code, p.scope
         FROM roles r
         INNER JOIN role_permissions rp ON rp.role_id = r.id
         INNER JOIN permissions p ON p.id = rp.permission_id
         WHERE r.code = ANY($1::text[])
         ORDER BY p.code ASC`,
        [[...roleCodes]]
      );

      return result.rows.map(mapPermissionGrantRow);
    }
  };
}
