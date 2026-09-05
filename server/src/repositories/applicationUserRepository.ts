import type { QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../postgres/pool.js";

export const applicationRoleCodes = [
  "PATIENT",
  "PERSONNEL",
  "DENTIST",
  "CLINIC_ADMINISTRATOR",
  "SYSTEM_ADMINISTRATOR"
] as const;

export type ApplicationRoleCode = (typeof applicationRoleCodes)[number];
export type ApplicationUserStatus = "pending" | "active" | "suspended" | "deactivated";

export interface ApplicationUserRecord {
  id: string;
  authUserId: string | null;
  email: string;
  displayName: string;
  status: ApplicationUserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationUserRepository {
  getByAuthUserId(authUserId: string): Promise<ApplicationUserRecord | null>;
  getById(userId: string): Promise<ApplicationUserRecord | null>;
  listRoleCodes(userId: string): Promise<ApplicationRoleCode[]>;
  listBranchIds(userId: string): Promise<string[]>;
}

interface ApplicationUserRow extends QueryResultRow {
  id: unknown;
  auth_user_id: unknown;
  email: unknown;
  display_name: unknown;
  status: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface RoleCodeRow extends QueryResultRow {
  code: unknown;
}

interface BranchIdRow extends QueryResultRow {
  branch_id: unknown;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedStatuses = new Set<ApplicationUserStatus>(["pending", "active", "suspended", "deactivated"]);
const allowedRoleCodes = new Set<ApplicationRoleCode>(applicationRoleCodes);

function requireUuid(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new Error(`Invalid application user database field: ${fieldName}`);
  }
  return value;
}

function requireOptionalUuid(value: unknown, fieldName: string): string | null {
  if (value === null) return null;
  return requireUuid(value, fieldName);
}

function requireNonBlankString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid application user database field: ${fieldName}`);
  }
  return value;
}

function requireTimestamp(value: unknown, fieldName: string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid application user database field: ${fieldName}`);
  }
  return new Date(value).toISOString();
}

function mapApplicationUserRow(row: ApplicationUserRow): ApplicationUserRecord {
  const status = requireNonBlankString(row.status, "status");
  if (!allowedStatuses.has(status as ApplicationUserStatus)) {
    throw new Error("Invalid application user database field: status");
  }

  return {
    id: requireUuid(row.id, "id"),
    authUserId: requireOptionalUuid(row.auth_user_id, "auth_user_id"),
    email: requireNonBlankString(row.email, "email"),
    displayName: requireNonBlankString(row.display_name, "display_name"),
    status: status as ApplicationUserStatus,
    createdAt: requireTimestamp(row.created_at, "created_at"),
    updatedAt: requireTimestamp(row.updated_at, "updated_at")
  };
}

function mapRoleCodeRow(row: RoleCodeRow): ApplicationRoleCode {
  const code = requireNonBlankString(row.code, "role.code");
  if (!allowedRoleCodes.has(code as ApplicationRoleCode)) {
    throw new Error("Invalid application user database field: role.code");
  }
  return code as ApplicationRoleCode;
}

function mapBranchIdRow(row: BranchIdRow): string {
  return requireUuid(row.branch_id, "branch_id");
}

export function createApplicationUserRepository(executor: PgQueryExecutor): ApplicationUserRepository {
  return {
    async getByAuthUserId(authUserId) {
      const result = await executor.query<ApplicationUserRow>(
        `SELECT id, auth_user_id, email, display_name, status, created_at, updated_at
         FROM app_users
         WHERE auth_user_id = $1
         LIMIT 1`,
        [authUserId]
      );
      return result.rows[0] ? mapApplicationUserRow(result.rows[0]) : null;
    },
    async getById(userId) {
      const result = await executor.query<ApplicationUserRow>(
        `SELECT id, auth_user_id, email, display_name, status, created_at, updated_at
         FROM app_users
         WHERE id = $1
         LIMIT 1`,
        [userId]
      );
      return result.rows[0] ? mapApplicationUserRow(result.rows[0]) : null;
    },
    async listRoleCodes(userId) {
      const result = await executor.query<RoleCodeRow>(
        `SELECT r.code
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1
         ORDER BY r.code ASC`,
        [userId]
      );
      return result.rows.map(mapRoleCodeRow);
    },
    async listBranchIds(userId) {
      const result = await executor.query<BranchIdRow>(
        `SELECT ub.branch_id
         FROM user_branches ub
         WHERE ub.user_id = $1
         ORDER BY ub.branch_id ASC`,
        [userId]
      );
      return result.rows.map(mapBranchIdRow);
    }
  };
}
