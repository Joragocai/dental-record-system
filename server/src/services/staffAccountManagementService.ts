import crypto from "node:crypto";
import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";
import {
  createStaffAccountRepository,
  type StaffAccountRepository
} from "../repositories/staffAccountRepository.js";
import { createAuditEventRepository, type AuditEventRepository } from "../repositories/auditEventRepository.js";
import { createAuditEventService } from "./auditEventService.js";
import type { ApplicationRoleCode } from "../repositories/applicationUserRepository.js";
import { StaffAccountError, toStaffAccountPersistenceError } from "./staffAccountErrors.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedStaffRoles = new Set<ApplicationRoleCode>(["PERSONNEL", "DENTIST"]);

export interface CreatePendingStaffAccountInput {
  displayName: unknown;
  email: unknown;
  roles: unknown;
  branchIds: unknown;
}

export interface PendingStaffAccountSummary {
  id: string;
  email: string;
  displayName: string;
  status: "pending";
  roles: ApplicationRoleCode[];
  branchIds: string[];
}

export interface StaffAccountActor {
  userId: string;
  authUserId: string;
  requestId?: string;
}

export interface StaffAccountManagementService {
  createPendingStaffAccount(
    input: CreatePendingStaffAccountInput,
    actor: StaffAccountActor
  ): Promise<PendingStaffAccountSummary>;
}

export interface StaffAccountServiceOptions {
  createRepository?: (executor: PgQueryExecutor) => StaffAccountRepository;
  createAuditRepository?: (executor: PgQueryExecutor) => AuditEventRepository;
  createId?: () => string;
  createAuditId?: () => string;
  now?: () => Date;
}

function normalizeDisplayName(value: unknown): string {
  if (typeof value !== "string") throw new StaffAccountError("STAFF_ACCOUNT_INPUT_INVALID");
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 160) {
    throw new StaffAccountError("STAFF_ACCOUNT_INPUT_INVALID");
  }
  return normalized;
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new StaffAccountError("STAFF_ACCOUNT_INPUT_INVALID");
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !emailPattern.test(normalized)) {
    throw new StaffAccountError("STAFF_ACCOUNT_INPUT_INVALID");
  }
  return normalized;
}

function normalizeRoles(value: unknown): ApplicationRoleCode[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new StaffAccountError("STAFF_ACCOUNT_ROLE_INVALID");
  }
  const roles: ApplicationRoleCode[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !allowedStaffRoles.has(item as ApplicationRoleCode)) {
      throw new StaffAccountError("STAFF_ACCOUNT_ROLE_INVALID");
    }
    roles.push(item as ApplicationRoleCode);
  }
  if (new Set(roles).size !== roles.length) {
    throw new StaffAccountError("STAFF_ACCOUNT_ROLE_INVALID");
  }
  return [...roles].sort();
}

function normalizeBranchIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new StaffAccountError("STAFF_ACCOUNT_BRANCH_INVALID");
  }
  const branchIds = value.map((item) => {
    if (typeof item !== "string") throw new StaffAccountError("STAFF_ACCOUNT_BRANCH_INVALID");
    const normalized = item.trim().toLowerCase();
    if (!uuidPattern.test(normalized)) throw new StaffAccountError("STAFF_ACCOUNT_BRANCH_INVALID");
    return normalized;
  });
  if (new Set(branchIds).size !== branchIds.length) {
    throw new StaffAccountError("STAFF_ACCOUNT_BRANCH_INVALID");
  }
  return [...branchIds].sort();
}

export function createStaffAccountManagementService(
  pool: PgPoolManager,
  options: StaffAccountServiceOptions = {}
): StaffAccountManagementService {
  const createRepository = options.createRepository ?? createStaffAccountRepository;
  const createAuditRepository = options.createAuditRepository ?? createAuditEventRepository;
  const createId = options.createId ?? (() => crypto.randomUUID());

  return {
    async createPendingStaffAccount(input, actor) {
      const displayName = normalizeDisplayName(input.displayName);
      const email = normalizeEmail(input.email);
      const roles = normalizeRoles(input.roles);
      const branchIds = normalizeBranchIds(input.branchIds);
      const id = createId().toLowerCase();
      if (!uuidPattern.test(id)) throw new StaffAccountError("STAFF_ACCOUNT_PERSISTENCE_ERROR");

      try {
        return await pool.withTransaction(async (executor) => {
          const repository = createRepository(executor);

          if (await repository.emailExists(email)) {
            throw new StaffAccountError("STAFF_ACCOUNT_EMAIL_CONFLICT");
          }

          const [roleIdsByCode, existingBranchIds] = await Promise.all([
            repository.resolveRoleIds(roles),
            repository.resolveExistingBranchIds(branchIds)
          ]);

          if (roleIdsByCode.size !== roles.length) {
            throw new StaffAccountError("STAFF_ACCOUNT_ROLE_INVALID");
          }
          if (existingBranchIds.size !== branchIds.length) {
            throw new StaffAccountError("STAFF_ACCOUNT_BRANCH_INVALID");
          }

          const roleIds = roles.map((role) => {
            const roleId = roleIdsByCode.get(role);
            if (!roleId) throw new StaffAccountError("STAFF_ACCOUNT_ROLE_INVALID");
            return roleId;
          });

          await repository.insertPendingUser({ id, email, displayName, status: "pending" });
          await repository.insertRoleAssignments(id, roleIds);
          await repository.insertBranchAssignments(id, branchIds);

          const auditService = createAuditEventService(createAuditRepository(executor), {
            createId: options.createAuditId,
            now: options.now
          });
          await auditService.recordStaffAccountCreated({
            actorUserId: actor.userId,
            actorAuthUserId: actor.authUserId,
            targetUserId: id,
            roles,
            branchIds,
            requestId: actor.requestId
          });

          return {
            id,
            email,
            displayName,
            status: "pending" as const,
            roles,
            branchIds
          };
        });
      } catch (error) {
        throw toStaffAccountPersistenceError(error);
      }
    }
  };
}
