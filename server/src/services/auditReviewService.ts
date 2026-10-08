import type { PgPoolManager } from "../postgres/pool.js";
import { createAuditEventRepository } from "../repositories/auditEventRepository.js";
import {
  auditExportMaxLimit,
  auditListMaxLimit,
  auditMaxOffset,
  createAuditReviewRepository,
  type AuditReviewFilters,
  type AuditReviewRecord
} from "../repositories/auditReviewRepository.js";
import { createAuditEventService, redactAuditMetadata } from "./auditEventService.js";
import { AuditReviewError } from "./auditReviewErrors.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tokenPattern = /^[A-Z0-9_.:-]{1,100}$/;
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;
const supportedFilterKeys = new Set([
  "action",
  "outcome",
  "branchId",
  "actorUserId",
  "targetType",
  "occurredFrom",
  "occurredTo",
  "limit",
  "offset"
]);

export interface AuditReviewActor {
  userId: string;
  authUserId: string;
  requestId: string;
}

export interface AuditReviewQueryInput {
  action?: unknown;
  outcome?: unknown;
  branchId?: unknown;
  actorUserId?: unknown;
  targetType?: unknown;
  occurredFrom?: unknown;
  occurredTo?: unknown;
  limit?: unknown;
  offset?: unknown;
}

export interface AuditListResult {
  items: AuditReviewRecord[];
  limit: number;
  offset: number;
}

export interface AuditReviewService {
  list(input: AuditReviewQueryInput, actor: AuditReviewActor): Promise<AuditListResult>;
  detail(auditEventId: unknown, actor: AuditReviewActor): Promise<AuditReviewRecord>;
  exportCsv(input: AuditReviewQueryInput, actor: AuditReviewActor): Promise<string>;
}

function optionalToken(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
  const normalized = value.trim().toUpperCase();
  if (!tokenPattern.test(normalized)) throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
  return normalized;
}

function optionalUuid(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
  const normalized = value.trim().toLowerCase();
  if (!uuidPattern.test(normalized)) throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
  return normalized;
}

function optionalDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
  const normalized = value.trim();
  if (!isoTimestampPattern.test(normalized)) {
    throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
  }
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
  return date.toISOString();
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || value === null || value === "") return fallback;

  let normalized: number;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
    normalized = Number(trimmed);
  } else if (typeof value === "number") {
    normalized = value;
  } else {
    throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
  }

  if (!Number.isInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
  }
  return normalized;
}

function normalizeFilters(input: AuditReviewQueryInput, maxLimit: number): AuditReviewFilters {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
  }
  for (const key of Object.keys(input as Record<string, unknown>)) {
    if (!supportedFilterKeys.has(key)) {
      throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
    }
  }

  const outcome = optionalToken(input.outcome);
  if (outcome && outcome !== "SUCCESS" && outcome !== "FAILURE") {
    throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
  }

  const occurredFrom = optionalDate(input.occurredFrom);
  const occurredTo = optionalDate(input.occurredTo);
  if (occurredFrom && occurredTo && occurredFrom > occurredTo) {
    throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
  }

  return {
    action: optionalToken(input.action),
    outcome: outcome as AuditReviewFilters["outcome"],
    branchId: optionalUuid(input.branchId),
    actorUserId: optionalUuid(input.actorUserId),
    targetType: optionalToken(input.targetType),
    occurredFrom,
    occurredTo,
    limit: boundedInteger(input.limit, Math.min(50, maxLimit), 1, maxLimit),
    offset: boundedInteger(input.offset, 0, 0, auditMaxOffset)
  };
}

function safeFilterMetadata(filters: AuditReviewFilters): Record<string, unknown> {
  return {
    action: filters.action ?? null,
    outcome: filters.outcome ?? null,
    branchId: filters.branchId ?? null,
    actorUserId: filters.actorUserId ?? null,
    targetType: filters.targetType ?? null,
    occurredFrom: filters.occurredFrom ?? null,
    occurredTo: filters.occurredTo ?? null,
    limit: filters.limit,
    offset: filters.offset
  };
}

function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value.trim())) {
    throw new AuditReviewError("AUDIT_REVIEW_INPUT_INVALID");
  }
  return value.trim().toLowerCase();
}

function sanitizeRecord(record: AuditReviewRecord): AuditReviewRecord {
  const metadata = redactAuditMetadata(record.metadata);
  return {
    ...record,
    metadata:
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata as Record<string, unknown>
        : { redacted: true }
  };
}

function neutralizeSpreadsheetFormula(value: string): string {
  return /^\s*[=+\-@]/u.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safeText = neutralizeSpreadsheetFormula(text);
  return `"${safeText.replaceAll('"', '""')}"`;
}

function toCsv(records: AuditReviewRecord[]): string {
  const header = [
    "id", "occurred_at", "actor_user_id", "action", "target_type",
    "target_id", "branch_id", "outcome", "request_id", "metadata"
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const record of records) {
    lines.push([
      record.id,
      record.occurredAt,
      record.actorUserId,
      record.action,
      record.targetType,
      record.targetId,
      record.branchId,
      record.outcome,
      record.requestId,
      JSON.stringify(record.metadata)
    ].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function createAuditReviewService(pool: PgPoolManager): AuditReviewService {
  return {
    async list(input, actor) {
      const filters = normalizeFilters(input, auditListMaxLimit);
      try {
        return await pool.withTransaction(async (executor) => {
          const items = (await createAuditReviewRepository(executor).list(filters)).map(sanitizeRecord);
          await createAuditEventService(createAuditEventRepository(executor)).recordAuditLogViewed({
            actorUserId: actor.userId,
            actorAuthUserId: actor.authUserId,
            requestId: actor.requestId,
            resultCount: items.length,
            filters: safeFilterMetadata(filters)
          });
          return { items, limit: filters.limit, offset: filters.offset };
        });
      } catch (error) {
        if (error instanceof AuditReviewError) throw error;
        throw new AuditReviewError("AUDIT_REVIEW_PERSISTENCE_ERROR");
      }
    },

    async detail(auditEventId, actor) {
      const id = requireUuid(auditEventId);
      try {
        return await pool.withTransaction(async (executor) => {
          const found = await createAuditReviewRepository(executor).getById(id);
          if (!found) throw new AuditReviewError("AUDIT_REVIEW_NOT_FOUND");
          const record = sanitizeRecord(found);
          await createAuditEventService(createAuditEventRepository(executor)).recordAuditLogViewed({
            actorUserId: actor.userId,
            actorAuthUserId: actor.authUserId,
            requestId: actor.requestId,
            resultCount: 1,
            targetAuditEventId: record.id,
            filters: { view: "detail" }
          });
          return record;
        });
      } catch (error) {
        if (error instanceof AuditReviewError) throw error;
        throw new AuditReviewError("AUDIT_REVIEW_PERSISTENCE_ERROR");
      }
    },

    async exportCsv(input, actor) {
      const filters = normalizeFilters(input, auditExportMaxLimit);
      try {
        return await pool.withTransaction(async (executor) => {
          const items = (await createAuditReviewRepository(executor).exportBounded(filters)).map(sanitizeRecord);
          await createAuditEventService(createAuditEventRepository(executor)).recordAuditLogExported({
            actorUserId: actor.userId,
            actorAuthUserId: actor.authUserId,
            requestId: actor.requestId,
            resultCount: items.length,
            filters: safeFilterMetadata(filters)
          });
          return toCsv(items);
        });
      } catch (error) {
        if (error instanceof AuditReviewError) throw error;
        throw new AuditReviewError("AUDIT_REVIEW_PERSISTENCE_ERROR");
      }
    }
  };
}
