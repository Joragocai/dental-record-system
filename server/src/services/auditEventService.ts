import crypto from "node:crypto";
import type { AuditEventRepository } from "../repositories/auditEventRepository.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const forbiddenMetadataKeyPattern = /(password|token|secret|authorization|cookie|service[-_]?role|connection[-_]?url|database[-_]?url)/i;
const forbiddenMetadataValuePatterns = [/^Bearer\s+/i, /^postgres(?:ql)?:\/\//i];

export class AuditEventError extends Error {
  constructor(message = "Audit event could not be recorded safely.") {
    super(message);
    this.name = "AuditEventError";
  }
}

export interface StaffAccountCreatedAuditInput {
  actorUserId: string;
  actorAuthUserId: string;
  targetUserId: string;
  roles: readonly string[];
  branchIds: readonly string[];
}

export interface StaffProvisioningAuditInput {
  actorUserId: string;
  actorAuthUserId: string;
  targetUserId: string;
}

export interface StaffProvisioningFailureAuditInput extends StaffProvisioningAuditInput {
  reasonCode: string;
}

export interface StaffActivationAuditInput {
  actorUserId: string;
  actorAuthUserId: string;
  targetUserId: string;
}

export interface InitialOwnerBootstrapAuditInput {
  targetUserId: string;
  branchId: string | null;
  reasonCode?: string;
}

export interface AuditEventService {
  recordStaffAccountCreated(input: StaffAccountCreatedAuditInput): Promise<void>;
  recordStaffUserInvited(input: StaffProvisioningAuditInput): Promise<void>;
  recordStaffUserInviteFailed(input: StaffProvisioningFailureAuditInput): Promise<void>;
  recordStaffUserActivated(input: StaffActivationAuditInput): Promise<void>;
  recordInitialOwnerBootstrapped(input: InitialOwnerBootstrapAuditInput): Promise<void>;
  recordInitialOwnerBootstrapFailed(input: InitialOwnerBootstrapAuditInput & { reasonCode: string }): Promise<void>;
  recordInitialOwnerInvited(input: InitialOwnerBootstrapAuditInput): Promise<void>;
  recordInitialOwnerActivationRecoverySent(input: InitialOwnerBootstrapAuditInput): Promise<void>;
}

export interface AuditEventServiceOptions {
  createId?: () => string;
  now?: () => Date;
}

function requireUuid(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!uuidPattern.test(normalized)) throw new AuditEventError();
  return normalized;
}

export function assertAuditMetadataSafe(value: unknown, keyPath = "metadata"): void {
  if (value === null || typeof value === "number" || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (forbiddenMetadataValuePatterns.some((pattern) => pattern.test(value.trim()))) {
      throw new AuditEventError();
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertAuditMetadataSafe(item, `${keyPath}[${index}]`));
    return;
  }
  if (typeof value !== "object") throw new AuditEventError();
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenMetadataKeyPattern.test(key)) throw new AuditEventError();
    assertAuditMetadataSafe(nested, `${keyPath}.${key}`);
  }
}

export function createAuditEventService(
  repository: AuditEventRepository,
  options: AuditEventServiceOptions = {}
): AuditEventService {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());

  async function insertSimpleStaffEvent(input: StaffProvisioningAuditInput, action: string, outcome: "SUCCESS" | "FAILURE", metadata: Record<string, unknown> = {}): Promise<void> {
    assertAuditMetadataSafe(metadata);
    try {
      await repository.insert({
        id: requireUuid(createId()),
        actorUserId: requireUuid(input.actorUserId),
        actorAuthUserId: requireUuid(input.actorAuthUserId),
        action,
        targetType: "APP_USER",
        targetId: requireUuid(input.targetUserId),
        branchId: null,
        outcome,
        metadata,
        occurredAt: now().toISOString()
      });
    } catch (error) {
      if (error instanceof AuditEventError) throw error;
      throw new AuditEventError();
    }
  }

  async function insertBootstrapEvent(
    input: InitialOwnerBootstrapAuditInput,
    action: string,
    outcome: "SUCCESS" | "FAILURE",
    metadata: Record<string, unknown>
  ): Promise<void> {
    assertAuditMetadataSafe(metadata);
    try {
      await repository.insert({
        id: requireUuid(createId()),
        actorUserId: null,
        actorAuthUserId: null,
        action,
        targetType: "APP_USER",
        targetId: requireUuid(input.targetUserId),
        branchId: input.branchId ? requireUuid(input.branchId) : null,
        outcome,
        metadata,
        occurredAt: now().toISOString()
      });
    } catch (error) {
      if (error instanceof AuditEventError) throw error;
      throw new AuditEventError();
    }
  }

  return {
    async recordStaffAccountCreated(input) {
      const metadata = {
        roles: [...input.roles].sort(),
        branchIds: [...input.branchIds].map(requireUuid).sort(),
        status: "pending"
      };
      assertAuditMetadataSafe(metadata);

      try {
        await repository.insert({
          id: requireUuid(createId()),
          actorUserId: requireUuid(input.actorUserId),
          actorAuthUserId: requireUuid(input.actorAuthUserId),
          action: "STAFF_ACCOUNT_CREATED",
          targetType: "APP_USER",
          targetId: requireUuid(input.targetUserId),
          branchId: null,
          outcome: "SUCCESS",
          metadata,
          occurredAt: now().toISOString()
        });
      } catch (error) {
        if (error instanceof AuditEventError) throw error;
        throw new AuditEventError();
      }
    },

    async recordStaffUserInvited(input) {
      await insertSimpleStaffEvent(input, "USER_INVITED", "SUCCESS", { status: "pending" });
    },

    async recordStaffUserInviteFailed(input) {
      const reasonCode = input.reasonCode.trim().toUpperCase();
      if (!/^[A-Z0-9_]{3,80}$/.test(reasonCode)) throw new AuditEventError();
      await insertSimpleStaffEvent(input, "USER_INVITED", "FAILURE", { reasonCode });
    },

    async recordStaffUserActivated(input) {
      await insertSimpleStaffEvent(input, "USER_ACTIVATED", "SUCCESS", { status: "active" });
    },

    async recordInitialOwnerBootstrapped(input) {
      await insertBootstrapEvent(input, "INITIAL_OWNER_BOOTSTRAPPED", "SUCCESS", {
        roles: ["CLINIC_ADMINISTRATOR", "DENTIST"],
        status: "pending",
        source: "server_cli"
      });
    },

    async recordInitialOwnerBootstrapFailed(input) {
      const reasonCode = input.reasonCode.trim().toUpperCase();
      if (!/^[A-Z0-9_]{3,80}$/.test(reasonCode)) throw new AuditEventError();
      await insertBootstrapEvent(input, "INITIAL_OWNER_BOOTSTRAPPED", "FAILURE", {
        reasonCode,
        source: "server_cli"
      });
    },

    async recordInitialOwnerInvited(input) {
      await insertBootstrapEvent(input, "USER_INVITED", "SUCCESS", {
        status: "pending",
        source: "server_cli"
      });
    },

    async recordInitialOwnerActivationRecoverySent(input) {
      await insertBootstrapEvent(input, "USER_ACTIVATION_RECOVERY_SENT", "SUCCESS", {
        status: "pending",
        source: "server_cli"
      });
    }
  };
}
