import type { QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../postgres/pool.js";
import type { ApplicationRoleCode } from "./applicationUserRepository.js";

export interface PendingStaffAccountRecord {
  id: string;
  email: string;
  displayName: string;
  status: "pending";
}

export interface StaffAccountRepository {
  emailExists(email: string): Promise<boolean>;
  resolveRoleIds(roleCodes: readonly ApplicationRoleCode[]): Promise<Map<ApplicationRoleCode, string>>;
  resolveExistingBranchIds(branchIds: readonly string[]): Promise<Set<string>>;
  insertPendingUser(record: PendingStaffAccountRecord): Promise<void>;
  insertRoleAssignments(userId: string, roleIds: readonly string[]): Promise<void>;
  insertBranchAssignments(userId: string, branchIds: readonly string[]): Promise<void>;
}

interface IdRow extends QueryResultRow {
  id: unknown;
}

interface RoleRow extends QueryResultRow {
  id: unknown;
  code: unknown;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new Error(`Invalid staff account database field: ${fieldName}`);
  }
  return value.toLowerCase();
}

function requireRoleCode(value: unknown): ApplicationRoleCode {
  if (
    value === "PATIENT" ||
    value === "PERSONNEL" ||
    value === "DENTIST" ||
    value === "CLINIC_ADMINISTRATOR" ||
    value === "SYSTEM_ADMINISTRATOR"
  ) {
    return value;
  }
  throw new Error("Invalid staff account database field: role.code");
}

export function createStaffAccountRepository(executor: PgQueryExecutor): StaffAccountRepository {
  return {
    async emailExists(email) {
      const result = await executor.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM app_users
           WHERE lower(trim(email)) = lower(trim($1))
         ) AS exists`,
        [email]
      );
      return result.rows[0]?.exists === true;
    },

    async resolveRoleIds(roleCodes) {
      if (roleCodes.length === 0) return new Map();
      const result = await executor.query<RoleRow>(
        `SELECT id, code
         FROM roles
         WHERE code = ANY($1::text[])
         ORDER BY code ASC`,
        [[...roleCodes]]
      );
      const mapped = new Map<ApplicationRoleCode, string>();
      for (const row of result.rows) {
        mapped.set(requireRoleCode(row.code), requireUuid(row.id, "role.id"));
      }
      return mapped;
    },

    async resolveExistingBranchIds(branchIds) {
      if (branchIds.length === 0) return new Set();
      const result = await executor.query<IdRow>(
        `SELECT id
         FROM branches
         WHERE id = ANY($1::uuid[])
         ORDER BY id ASC`,
        [[...branchIds]]
      );
      return new Set(result.rows.map((row) => requireUuid(row.id, "branch.id")));
    },

    async insertPendingUser(record) {
      await executor.query(
        `INSERT INTO app_users (
           id, auth_user_id, email, display_name, status, created_at, updated_at
         ) VALUES ($1, NULL, $2, $3, 'pending', NOW(), NOW())`,
        [record.id, record.email, record.displayName]
      );
    },

    async insertRoleAssignments(userId, roleIds) {
      for (const roleId of roleIds) {
        await executor.query(
          `INSERT INTO user_roles (user_id, role_id, assigned_at)
           VALUES ($1, $2, NOW())`,
          [userId, roleId]
        );
      }
    },

    async insertBranchAssignments(userId, branchIds) {
      for (const branchId of branchIds) {
        await executor.query(
          `INSERT INTO user_branches (user_id, branch_id, assigned_at)
           VALUES ($1, $2, NOW())`,
          [userId, branchId]
        );
      }
    }
  };
}
