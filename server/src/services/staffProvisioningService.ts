import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";
import { createAuditEventRepository } from "../repositories/auditEventRepository.js";
import {
  createStaffProvisioningRepository,
  type StaffProvisioningRepository,
  type StaffProvisioningTarget
} from "../repositories/staffProvisioningRepository.js";
import type { StaffProvisioningProvider } from "../staff/supabaseStaffProvisioningProvider.js";
import { createAuditEventService } from "./auditEventService.js";
import {
  StaffProvisioningError,
  toStaffProvisioningPersistenceError
} from "./staffProvisioningErrors.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedRoutineRoles = new Set(["PERSONNEL", "DENTIST"]);

export interface InvitePendingStaffInput {
  targetUserId: string;
  actorUserId: string;
  actorAuthUserId: string;
}

export interface InvitePendingStaffResult {
  id: string;
  status: "pending";
  invitation: "sent" | "already_sent";
}

export interface ActivateInvitedStaffInput {
  authUserId: string;
  email: string | null;
}

export interface StaffProvisioningService {
  invitePendingStaff(input: InvitePendingStaffInput): Promise<InvitePendingStaffResult>;
  activateInvitedStaff(input: ActivateInvitedStaffInput): Promise<{ activated: true }>;
}

export interface StaffProvisioningServiceOptions {
  createRepository?: (executor: PgQueryExecutor) => StaffProvisioningRepository;
  inviteRedirectUrl: string;
}

function normalizeUuid(value: string): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!uuidPattern.test(normalized)) throw new StaffProvisioningError("STAFF_PROVISIONING_INPUT_INVALID");
  return normalized;
}

function assertEligiblePendingTarget(target: StaffProvisioningTarget): void {
  if (target.status !== "pending") throw new StaffProvisioningError("STAFF_PROVISIONING_TARGET_NOT_PENDING");
  if (target.roles.length === 0 || target.branchIds.length === 0) {
    throw new StaffProvisioningError("STAFF_PROVISIONING_TARGET_INVALID");
  }
  if (target.roles.some((role) => !allowedRoutineRoles.has(role))) {
    throw new StaffProvisioningError("STAFF_PROVISIONING_TARGET_INVALID");
  }
}

export function createStaffProvisioningService(
  pool: PgPoolManager,
  provider: StaffProvisioningProvider,
  options: StaffProvisioningServiceOptions
): StaffProvisioningService {
  const createRepository = options.createRepository ?? createStaffProvisioningRepository;

  async function recordInviteFailureBestEffort(
    actorUserId: string,
    actorAuthUserId: string,
    targetUserId: string,
    reasonCode: string
  ): Promise<void> {
    try {
      await pool.withTransaction(async (executor) => {
        const auditService = createAuditEventService(createAuditEventRepository(executor));
        await auditService.recordStaffUserInviteFailed({ actorUserId, actorAuthUserId, targetUserId, reasonCode });
      });
    } catch {
      // Never replace the primary provisioning failure with an audit write failure.
    }
  }

  return {
    async invitePendingStaff(input) {
      const targetUserId = normalizeUuid(input.targetUserId);
      const actorUserId = normalizeUuid(input.actorUserId);
      const actorAuthUserId = normalizeUuid(input.actorAuthUserId);

      let target: StaffProvisioningTarget;
      try {
        const found = await createRepository(pool).getById(targetUserId);
        if (!found) throw new StaffProvisioningError("STAFF_PROVISIONING_TARGET_NOT_FOUND");
        target = found;
        assertEligiblePendingTarget(target);
      } catch (error) {
        throw toStaffProvisioningPersistenceError(error);
      }

      if (target.authUserId) {
        return { id: target.id, status: "pending", invitation: "already_sent" };
      }

      let providerUserId: string;
      try {
        providerUserId = (
          await provider.inviteUserByEmail(target.email, options.inviteRedirectUrl, target.id)
        ).providerUserId;
      } catch (error) {
        const safeError = error instanceof StaffProvisioningError
          ? error
          : new StaffProvisioningError("STAFF_PROVISIONING_PROVIDER_UNAVAILABLE");
        await recordInviteFailureBestEffort(
          actorUserId,
          actorAuthUserId,
          targetUserId,
          safeError.code === "STAFF_PROVISIONING_PROVIDER_CONFLICT" ? "PROVIDER_CONFLICT" : "PROVIDER_UNAVAILABLE"
        );
        throw safeError;
      }

      try {
        await pool.withTransaction(async (executor) => {
          const repository = createRepository(executor);
          const linked = await repository.linkProviderUser(targetUserId, providerUserId);
          if (!linked) throw new StaffProvisioningError("STAFF_PROVISIONING_TARGET_NOT_PENDING");

          const auditService = createAuditEventService(createAuditEventRepository(executor));
          await auditService.recordStaffUserInvited({ actorUserId, actorAuthUserId, targetUserId });
        });
      } catch (error) {
        const cleanedUp = await provider.deleteUser(providerUserId);
        await recordInviteFailureBestEffort(
          actorUserId,
          actorAuthUserId,
          targetUserId,
          cleanedUp ? "DATABASE_LINK_FAILED_CLEANED_UP" : "RECONCILIATION_REQUIRED"
        );
        if (!cleanedUp) {
          throw new StaffProvisioningError("STAFF_PROVISIONING_RECONCILIATION_REQUIRED");
        }
        throw toStaffProvisioningPersistenceError(error);
      }

      return { id: target.id, status: "pending", invitation: "sent" };
    },

    async activateInvitedStaff(input) {
      const authUserId = normalizeUuid(input.authUserId);
      const normalizedEmail = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
      if (!normalizedEmail) throw new StaffProvisioningError("STAFF_PROVISIONING_EMAIL_MISMATCH");

      let target: StaffProvisioningTarget;
      try {
        const found = await createRepository(pool).getByAuthUserId(authUserId);
        if (!found) throw new StaffProvisioningError("STAFF_PROVISIONING_TARGET_NOT_FOUND");
        target = found;
        assertEligiblePendingTarget(target);
        if (target.email.toLowerCase() !== normalizedEmail) {
          throw new StaffProvisioningError("STAFF_PROVISIONING_EMAIL_MISMATCH");
        }
      } catch (error) {
        throw toStaffProvisioningPersistenceError(error);
      }

      try {
        await pool.withTransaction(async (executor) => {
          const repository = createRepository(executor);
          const activated = await repository.activateLinkedUser(target.id, authUserId);
          if (!activated) throw new StaffProvisioningError("STAFF_PROVISIONING_TARGET_NOT_PENDING");

          const auditService = createAuditEventService(createAuditEventRepository(executor));
          await auditService.recordStaffUserActivated({
            actorUserId: target.id,
            actorAuthUserId: authUserId,
            targetUserId: target.id
          });
        });
      } catch (error) {
        throw toStaffProvisioningPersistenceError(error);
      }

      return { activated: true };
    }
  };
}
