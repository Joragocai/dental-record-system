import type { QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../postgres/pool.js";
import type { ApplicationRoleCode } from "./applicationUserRepository.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set(["pending", "active", "suspended", "deactivated"] as const);

export interface StaffProvisioningTarget {
  id: string;
  authUserId: string | null;
  email: string;
  displayName: string;
  status: "pending" | "active" | "suspended" | "deactivated";
  roles: ApplicationRoleCode[];
  branchIds: string[];
}

export interface StaffProvisioningRepository {
  getById(userId: string): Promise<StaffProvisioningTarget | null>;
  getByAuthUserId(authUserId: string): Promise<StaffProvisioningTarget | null>;
  linkProviderUser(userId: string, providerUserId: string): Promise<boolean>;
  activateLinkedUser(userId: string, providerUserId: string): Promise<boolean>;
}

interface UserRow extends QueryResultRow {
  id: unknown;
  auth_user_id: unknown;
  email: unknown;
  display_name: unknown;
  status: unknown;
}

interface RoleRow extends QueryResultRow { code: unknown; }
interface BranchRow extends QueryResultRow { branch_id: unknown; }

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error(`Invalid provisioning DB field: ${field}`);
  return value.toLowerCase();
}

function nullableUuid(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requireUuid(value, field);
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid provisioning DB field: ${field}`);
  return value.trim();
}

function requireStatus(value: unknown): StaffProvisioningTarget["status"] {
  if (typeof value === "string" && statuses.has(value as StaffProvisioningTarget["status"])) {
    return value as StaffProvisioningTarget["status"];
  }
  throw new Error("Invalid provisioning DB field: status");
}

function requireRoleCode(value: unknown): ApplicationRoleCode {
  if (
    value === "PATIENT" ||
    value === "PERSONNEL" ||
    value === "DENTIST" ||
    value === "CLINIC_ADMINISTRATOR" ||
    value === "SYSTEM_ADMINISTRATOR"
  ) return value;
  throw new Error("Invalid provisioning DB field: role.code");
}

async function loadTarget(executor: PgQueryExecutor, whereSql: string, value: string): Promise<StaffProvisioningTarget | null> {
  const userResult = await executor.query<UserRow>(
    `SELECT id, auth_user_id, email, display_name, status
     FROM app_users
     WHERE ${whereSql}
     LIMIT 1`,
    [value]
  );
  const row = userResult.rows[0];
  if (!row) return null;

  const id = requireUuid(row.id, "app_users.id");
  const [rolesResult, branchesResult] = await Promise.all([
    executor.query<RoleRow>(
      `SELECT r.code
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1
       ORDER BY r.code ASC`,
      [id]
    ),
    executor.query<BranchRow>(
      `SELECT branch_id
       FROM user_branches
       WHERE user_id = $1
       ORDER BY branch_id ASC`,
      [id]
    )
  ]);

  return {
    id,
    authUserId: nullableUuid(row.auth_user_id, "app_users.auth_user_id"),
    email: requireText(row.email, "app_users.email").toLowerCase(),
    displayName: requireText(row.display_name, "app_users.display_name"),
    status: requireStatus(row.status),
    roles: rolesResult.rows.map((item) => requireRoleCode(item.code)),
    branchIds: branchesResult.rows.map((item) => requireUuid(item.branch_id, "user_branches.branch_id"))
  };
}

export function createStaffProvisioningRepository(executor: PgQueryExecutor): StaffProvisioningRepository {
  return {
    getById(userId) {
      return loadTarget(executor, "id = $1", userId);
    },
    getByAuthUserId(authUserId) {
      return loadTarget(executor, "auth_user_id = $1", authUserId);
    },
    async linkProviderUser(userId, providerUserId) {
      const result = await executor.query(
        `UPDATE app_users
         SET auth_user_id = $2,
             updated_at = NOW()
         WHERE id = $1
           AND status = 'pending'
           AND auth_user_id IS NULL`,
        [userId, providerUserId]
      );
      return result.rowCount === 1;
    },
    async activateLinkedUser(userId, providerUserId) {
      const result = await executor.query(
        `UPDATE app_users
         SET status = 'active',
             updated_at = NOW()
         WHERE id = $1
           AND auth_user_id = $2
           AND status = 'pending'`,
        [userId, providerUserId]
      );
      return result.rowCount === 1;
    }
  };
}
