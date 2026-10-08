import crypto from "node:crypto";
import type { AuditEventRepository } from "../repositories/auditEventRepository.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const forbiddenMetadataKeyPattern = /(password|passphrase|token|secret|authorization|cookie|credential|api[-_]?key|access[-_]?key|client[-_]?key|private[-_]?key|jwt|service[-_]?role|connection[-_]?url|database[-_]?url)/i;
const forbiddenMetadataValuePatterns = [
  /^Bearer\s+/i,
  /^postgres(?:ql)?:\/\//i,
  /^sb_secret_/i,
  /^-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/
];
const redactedAuditMetadataValue = "[REDACTED]";

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
  requestId?: string;
}

export interface StaffProvisioningAuditInput {
  actorUserId: string;
  actorAuthUserId: string;
  targetUserId: string;
  requestId?: string;
}

export interface StaffProvisioningFailureAuditInput extends StaffProvisioningAuditInput {
  reasonCode: string;
}

export interface StaffActivationAuditInput extends StaffProvisioningAuditInput {}

export interface InitialOwnerBootstrapAuditInput {
  targetUserId: string;
  branchId: string | null;
  reasonCode?: string;
}

export interface AuditAccessAuditInput {
  actorUserId: string;
  actorAuthUserId: string;
  requestId: string;
  resultCount?: number;
  targetAuditEventId?: string | null;
  filters?: Record<string, unknown>;
}

export interface AuthorizationDeniedAuditInput {
  actorUserId: string;
  actorAuthUserId: string;
  requestId: string;
  permission: string;
  branchId?: string | null;
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
  recordAuditLogViewed(input: AuditAccessAuditInput): Promise<void>;
  recordAuditLogExported(input: AuditAccessAuditInput): Promise<void>;
  recordAuthorizationDenied(input: AuthorizationDeniedAuditInput): Promise<void>;
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

function isForbiddenMetadataString(value: string): boolean {
  const normalized = value.trim();
  return forbiddenMetadataValuePatterns.some((pattern) => pattern.test(normalized));
}

export function assertAuditMetadataSafe(value: unknown, keyPath = "metadata"): void {
  if (value === null || typeof value === "number" || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (isForbiddenMetadataString(value)) {
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

export function redactAuditMetadata(value: unknown): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return isForbiddenMetadataString(value) ? redactedAuditMetadataValue : value;
  }
  if (Array.isArray(value)) return value.map((item) => redactAuditMetadata(item));
  if (!value || typeof value !== "object") return redactedAuditMetadataValue;

  const redacted: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    redacted[key] = forbiddenMetadataKeyPattern.test(key)
      ? redactedAuditMetadataValue
      : redactAuditMetadata(nested);
  }
  return redacted;
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
        occurredAt: now().toISOString(),
        requestId: input.requestId ? requireUuid(input.requestId) : null
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

  async function insertHttpSecurityEvent(input: {
    actorUserId: string;
    actorAuthUserId: string;
    requestId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    branchId?: string | null;
    outcome: "SUCCESS" | "FAILURE";
    metadata: Record<string, unknown>;
  }): Promise<void> {
    assertAuditMetadataSafe(input.metadata);
    try {
      await repository.insert({
        id: requireUuid(createId()),
        actorUserId: requireUuid(input.actorUserId),
        actorAuthUserId: requireUuid(input.actorAuthUserId),
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ? requireUuid(input.targetId) : null,
        branchId: input.branchId ? requireUuid(input.branchId) : null,
        outcome: input.outcome,
        metadata: input.metadata,
        occurredAt: now().toISOString(),
        requestId: requireUuid(input.requestId)
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
          occurredAt: now().toISOString(),
          requestId: input.requestId ? requireUuid(input.requestId) : null
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
    },

    async recordAuditLogViewed(input) {
      await insertHttpSecurityEvent({
        actorUserId: input.actorUserId,
        actorAuthUserId: input.actorAuthUserId,
        requestId: input.requestId,
        action: "AUDIT_LOG_VIEWED",
        targetType: "AUDIT_EVENT",
        targetId: input.targetAuditEventId ?? null,
        outcome: "SUCCESS",
        metadata: {
          resultCount: input.resultCount ?? null,
          filters: input.filters ?? {}
        }
      });
    },

    async recordAuditLogExported(input) {
      await insertHttpSecurityEvent({
        actorUserId: input.actorUserId,
        actorAuthUserId: input.actorAuthUserId,
        requestId: input.requestId,
        action: "AUDIT_LOG_EXPORTED",
        targetType: "AUDIT_EVENT",
        targetId: null,
        outcome: "SUCCESS",
        metadata: {
          resultCount: input.resultCount ?? null,
          filters: input.filters ?? {}
        }
      });
    },

    async recordAuthorizationDenied(input) {
      await insertHttpSecurityEvent({
        actorUserId: input.actorUserId,
        actorAuthUserId: input.actorAuthUserId,
        requestId: input.requestId,
        action: "AUTHORIZATION_DENIED",
        targetType: "PERMISSION",
        targetId: null,
        branchId: input.branchId ?? null,
        outcome: "FAILURE",
        metadata: {
          permission: input.permission
        }
      });
    }
  };
}
