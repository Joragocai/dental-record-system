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

export interface AuditEventService {
  recordStaffAccountCreated(input: StaffAccountCreatedAuditInput): Promise<void>;
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
    }
  };
}
