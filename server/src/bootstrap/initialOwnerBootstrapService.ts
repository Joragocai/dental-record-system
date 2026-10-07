import crypto from "node:crypto";
import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";
import type { ApplicationRoleCode } from "../repositories/applicationUserRepository.js";
import { createAuditEventRepository, type AuditEventRepository } from "../repositories/auditEventRepository.js";
import type { StaffProvisioningProvider } from "../staff/supabaseStaffProvisioningProvider.js";
import { createAuditEventService } from "../services/auditEventService.js";
import {
  createInitialOwnerBootstrapRepository,
  type BootstrapBranchSummary,
  type InitialOwnerBootstrapRepository
} from "./initialOwnerBootstrapRepository.js";
import {
  InitialOwnerBootstrapError,
  toInitialOwnerBootstrapPersistenceError
} from "./initialOwnerBootstrapErrors.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ownerRoles: readonly ApplicationRoleCode[] = ["CLINIC_ADMINISTRATOR", "DENTIST"];

export interface InitialOwnerBootstrapInput {
  displayName: unknown;
  email: unknown;
  branchId: unknown;
}

export interface InitialOwnerBootstrapResult {
  id: string;
  displayName: string;
  email: string;
  branchId: string;
  status: "pending";
  roles: ["CLINIC_ADMINISTRATOR", "DENTIST"];
  invitation: "sent";
}

export interface InitialOwnerBootstrapService {
  listBranches(): Promise<BootstrapBranchSummary[]>;
  bootstrap(input: InitialOwnerBootstrapInput): Promise<InitialOwnerBootstrapResult>;
  resendPendingOwnerInvitation(): Promise<{
    id: string;
    email: string;
    branchId: string;
    invitation: "sent";
  }>;
}

export interface InitialOwnerBootstrapServiceOptions {
  createRepository?: (executor: PgQueryExecutor) => InitialOwnerBootstrapRepository;
  createAuditRepository?: (executor: PgQueryExecutor) => AuditEventRepository;
  createId?: () => string;
  createAuditId?: () => string;
  now?: () => Date;
  inviteRedirectUrl: string;
}

function normalizeDisplayName(value: unknown): string {
  if (typeof value !== "string") throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_INPUT_INVALID");
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 160) {
    throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_INPUT_INVALID");
  }
  return normalized;
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_INPUT_INVALID");
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !emailPattern.test(normalized)) {
    throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_INPUT_INVALID");
  }
  return normalized;
}

function normalizeBranchId(value: unknown): string {
  if (typeof value !== "string") throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_BRANCH_INVALID");
  const normalized = value.trim().toLowerCase();
  if (!uuidPattern.test(normalized)) throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_BRANCH_INVALID");
  return normalized;
}

function normalizeGeneratedUuid(value: string): string {
  const normalized = value.toLowerCase();
  if (!uuidPattern.test(normalized)) throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_PERSISTENCE_ERROR");
  return normalized;
}

export function createInitialOwnerBootstrapService(
  pool: PgPoolManager,
  provider: StaffProvisioningProvider,
  options: InitialOwnerBootstrapServiceOptions
): InitialOwnerBootstrapService {
  const createRepository = options.createRepository ?? createInitialOwnerBootstrapRepository;
  const createAuditRepository = options.createAuditRepository ?? createAuditEventRepository;
  const createId = options.createId ?? (() => crypto.randomUUID());

  async function preflight(email: string, branchId: string): Promise<void> {
    try {
      const repository = createRepository(pool);
      if (await repository.hasClinicAdministrator()) {
        throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_ALREADY_COMPLETED");
      }
      if (await repository.emailExists(email)) {
        throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_EMAIL_CONFLICT");
      }
      if (!(await repository.getBranchById(branchId))) {
        throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_BRANCH_INVALID");
      }
      const roles = await repository.resolveRoleIds(ownerRoles);
      if (roles.size !== ownerRoles.length) {
        throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_ROLE_INVALID");
      }
    } catch (error) {
      throw toInitialOwnerBootstrapPersistenceError(error);
    }
  }

  async function recordFailureBestEffort(targetUserId: string, branchId: string | null, reasonCode: string): Promise<void> {
    try {
      await pool.withTransaction(async (executor) => {
        const audit = createAuditEventService(createAuditRepository(executor), {
          createId: options.createAuditId,
          now: options.now
        });
        await audit.recordInitialOwnerBootstrapFailed({ targetUserId, branchId, reasonCode });
      });
    } catch {
      // Preserve the primary bootstrap failure.
    }
  }

  return {
    async listBranches() {
      try {
        return await createRepository(pool).listBranches();
      } catch (error) {
        throw toInitialOwnerBootstrapPersistenceError(error);
      }
    },

    async resendPendingOwnerInvitation() {
      let owner;
      try {
        owner = await createRepository(pool).getPendingInitialOwner();
      } catch (error) {
        throw toInitialOwnerBootstrapPersistenceError(error);
      }

      if (!owner) {
        throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_PERSISTENCE_ERROR");
      }

      const sortedRoles = [...owner.roles].sort();
      const expectedRoles = [...ownerRoles].sort();
      if (
        sortedRoles.length !== expectedRoles.length ||
        !sortedRoles.every((role, index) => role === expectedRoles[index]) ||
        owner.branchIds.length !== 1
      ) {
        throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_ROLE_INVALID");
      }

      const branchId = owner.branchIds[0]!;
      if (!provider.sendPasswordRecovery) {
        throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_PROVIDER_UNAVAILABLE");
      }

      try {
        await provider.sendPasswordRecovery(owner.email, options.inviteRedirectUrl);
      } catch {
        throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_PROVIDER_UNAVAILABLE");
      }

      try {
        await pool.withTransaction(async (executor) => {
          const audit = createAuditEventService(createAuditRepository(executor), {
            createId: options.createAuditId,
            now: options.now
          });
          await audit.recordInitialOwnerActivationRecoverySent({ targetUserId: owner.id, branchId });
        });
      } catch (error) {
        throw toInitialOwnerBootstrapPersistenceError(error);
      }

      return {
        id: owner.id,
        email: owner.email,
        branchId,
        invitation: "sent"
      };
    },

    async bootstrap(input) {
      const displayName = normalizeDisplayName(input.displayName);
      const email = normalizeEmail(input.email);
      const branchId = normalizeBranchId(input.branchId);
      const targetUserId = normalizeGeneratedUuid(createId());

      await preflight(email, branchId);

      let providerUserId: string;
      try {
        providerUserId = (
          await provider.inviteUserByEmail(email, options.inviteRedirectUrl, targetUserId)
        ).providerUserId;
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
        const mapped = code === "STAFF_PROVISIONING_PROVIDER_CONFLICT"
          ? new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_PROVIDER_CONFLICT")
          : new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_PROVIDER_UNAVAILABLE");
        await recordFailureBestEffort(
          targetUserId,
          branchId,
          mapped.code === "INITIAL_OWNER_BOOTSTRAP_PROVIDER_CONFLICT" ? "PROVIDER_CONFLICT" : "PROVIDER_UNAVAILABLE"
        );
        throw mapped;
      }

      try {
        await pool.withTransaction(async (executor) => {
          const repository = createRepository(executor);
          await repository.acquireBootstrapLock();

          if (await repository.hasClinicAdministrator()) {
            throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_ALREADY_COMPLETED");
          }
          if (await repository.emailExists(email)) {
            throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_EMAIL_CONFLICT");
          }
          if (!(await repository.getBranchById(branchId))) {
            throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_BRANCH_INVALID");
          }

          const roleIds = await repository.resolveRoleIds(ownerRoles);
          if (roleIds.size !== ownerRoles.length) {
            throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_ROLE_INVALID");
          }

          await repository.insertPendingLinkedOwner({
            id: targetUserId,
            providerUserId,
            email,
            displayName
          });
          await repository.insertRoleAssignments(
            targetUserId,
            ownerRoles.map((role) => {
              const roleId = roleIds.get(role);
              if (!roleId) throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_ROLE_INVALID");
              return roleId;
            })
          );
          await repository.insertBranchAssignment(targetUserId, branchId);

          const audit = createAuditEventService(createAuditRepository(executor), {
            createId: options.createAuditId,
            now: options.now
          });
          await audit.recordInitialOwnerBootstrapped({ targetUserId, branchId });
          await audit.recordInitialOwnerInvited({ targetUserId, branchId });
        });
      } catch (error) {
        const cleanedUp = await provider.deleteUser(providerUserId);
        await recordFailureBestEffort(
          targetUserId,
          branchId,
          cleanedUp ? "DATABASE_TRANSACTION_FAILED_CLEANED_UP" : "RECONCILIATION_REQUIRED"
        );
        if (!cleanedUp) {
          throw new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_RECONCILIATION_REQUIRED");
        }
        throw toInitialOwnerBootstrapPersistenceError(error);
      }

      return {
        id: targetUserId,
        displayName,
        email,
        branchId,
        status: "pending",
        roles: ["CLINIC_ADMINISTRATOR", "DENTIST"],
        invitation: "sent"
      };
    }
  };
}
