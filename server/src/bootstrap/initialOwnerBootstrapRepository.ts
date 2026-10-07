import type { QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../postgres/pool.js";
import type { ApplicationRoleCode } from "../repositories/applicationUserRepository.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bootstrapLockKey = "8051001";

export interface BootstrapBranchSummary {
  id: string;
  code: string;
  name: string;
}

export interface PendingInitialOwnerSummary {
  id: string;
  providerUserId: string;
  email: string;
  roles: ApplicationRoleCode[];
  branchIds: string[];
}

export interface InitialOwnerBootstrapRepository {
  acquireBootstrapLock(): Promise<void>;
  hasClinicAdministrator(): Promise<boolean>;
  emailExists(email: string): Promise<boolean>;
  getBranchById(branchId: string): Promise<BootstrapBranchSummary | null>;
  listBranches(): Promise<BootstrapBranchSummary[]>;
  getPendingInitialOwner(): Promise<PendingInitialOwnerSummary | null>;
  resolveRoleIds(roleCodes: readonly ApplicationRoleCode[]): Promise<Map<ApplicationRoleCode, string>>;
  insertPendingLinkedOwner(input: {
    id: string;
    providerUserId: string;
    email: string;
    displayName: string;
  }): Promise<void>;
  insertRoleAssignments(userId: string, roleIds: readonly string[]): Promise<void>;
  insertBranchAssignment(userId: string, branchId: string): Promise<void>;
}

interface ExistsRow extends QueryResultRow { exists: unknown; }
interface BranchRow extends QueryResultRow { id: unknown; branch_code: unknown; branch_name: unknown; }
interface RoleRow extends QueryResultRow { id: unknown; code: unknown; }
interface PendingOwnerRow extends QueryResultRow {
  id: unknown;
  auth_user_id: unknown;
  email: unknown;
  roles: unknown;
  branch_ids: unknown;
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error(`Invalid bootstrap DB field: ${field}`);
  return value.toLowerCase();
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid bootstrap DB field: ${field}`);
  return value.trim();
}

function requireRoleCode(value: unknown): ApplicationRoleCode {
  if (
    value === "PATIENT" ||
    value === "PERSONNEL" ||
    value === "DENTIST" ||
    value === "CLINIC_ADMINISTRATOR" ||
    value === "SYSTEM_ADMINISTRATOR"
  ) return value;
  throw new Error("Invalid bootstrap DB field: role.code");
}

function mapBranch(row: BranchRow): BootstrapBranchSummary {
  return {
    id: requireUuid(row.id, "branch.id"),
    code: requireText(row.branch_code, "branch.branch_code"),
    name: requireText(row.branch_name, "branch.branch_name")
  };
}

function requireRoleArray(value: unknown): ApplicationRoleCode[] {
  if (!Array.isArray(value)) throw new Error("Invalid bootstrap DB field: owner.roles");
  return value.map(requireRoleCode).sort();
}

function requireUuidArray(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Invalid bootstrap DB field: owner.branch_ids");
  return value.map((item) => requireUuid(item, "owner.branch_ids")).sort();
}

export function createInitialOwnerBootstrapRepository(executor: PgQueryExecutor): InitialOwnerBootstrapRepository {
  return {
    async acquireBootstrapLock() {
      await executor.query("SELECT pg_advisory_xact_lock($1::bigint)", [bootstrapLockKey]);
    },

    async hasClinicAdministrator() {
      const result = await executor.query<ExistsRow>(
        `SELECT EXISTS (
           SELECT 1
           FROM user_roles ur
           INNER JOIN roles r ON r.id = ur.role_id
           WHERE r.code = 'CLINIC_ADMINISTRATOR'
         ) AS exists`
      );
      return result.rows[0]?.exists === true;
    },

    async emailExists(email) {
      const result = await executor.query<ExistsRow>(
        `SELECT EXISTS (
           SELECT 1
           FROM app_users
           WHERE lower(trim(email)) = lower(trim($1))
         ) AS exists`,
        [email]
      );
      return result.rows[0]?.exists === true;
    },

    async getBranchById(branchId) {
      const result = await executor.query<BranchRow>(
        `SELECT id, branch_code, branch_name
         FROM branches
         WHERE id = $1
         LIMIT 1`,
        [branchId]
      );
      return result.rows[0] ? mapBranch(result.rows[0]) : null;
    },

    async listBranches() {
      const result = await executor.query<BranchRow>(
        `SELECT id, branch_code, branch_name
         FROM branches
         ORDER BY branch_code ASC, branch_name ASC, id ASC`
      );
      return result.rows.map(mapBranch);
    },

    async getPendingInitialOwner() {
      const result = await executor.query<PendingOwnerRow>(
        `SELECT
           u.id,
           u.auth_user_id,
           u.email,
           ARRAY_AGG(DISTINCT r.code ORDER BY r.code) AS roles,
           ARRAY_AGG(DISTINCT ub.branch_id::text ORDER BY ub.branch_id::text) AS branch_ids
         FROM app_users u
         INNER JOIN user_roles ur ON ur.user_id = u.id
         INNER JOIN roles r ON r.id = ur.role_id
         INNER JOIN user_branches ub ON ub.user_id = u.id
         WHERE u.status = 'pending'
           AND EXISTS (
             SELECT 1
             FROM user_roles caur
             INNER JOIN roles car ON car.id = caur.role_id
             WHERE caur.user_id = u.id
               AND car.code = 'CLINIC_ADMINISTRATOR'
           )
         GROUP BY u.id, u.auth_user_id, u.email
         ORDER BY u.created_at ASC, u.id ASC
         LIMIT 2`
      );

      if (result.rows.length === 0) return null;
      if (result.rows.length > 1) throw new Error("Multiple pending Clinic Administrator users exist.");

      const row = result.rows[0]!;
      return {
        id: requireUuid(row.id, "owner.id"),
        providerUserId: requireUuid(row.auth_user_id, "owner.auth_user_id"),
        email: requireText(row.email, "owner.email").toLowerCase(),
        roles: requireRoleArray(row.roles),
        branchIds: requireUuidArray(row.branch_ids)
      };
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

    async insertPendingLinkedOwner(input) {
      await executor.query(
        `INSERT INTO app_users (
           id, auth_user_id, email, display_name, status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())`,
        [input.id, input.providerUserId, input.email, input.displayName]
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

    async insertBranchAssignment(userId, branchId) {
      await executor.query(
        `INSERT INTO user_branches (user_id, branch_id, assigned_at)
         VALUES ($1, $2, NOW())`,
        [userId, branchId]
      );
    }
  };
}
