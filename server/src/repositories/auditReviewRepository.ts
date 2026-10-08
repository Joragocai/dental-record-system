import type { QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../postgres/pool.js";
import type { AuditOutcome } from "./auditEventRepository.js";

export interface AuditReviewFilters {
  action?: string;
  outcome?: AuditOutcome;
  branchId?: string;
  actorUserId?: string;
  targetType?: string;
  occurredFrom?: string;
  occurredTo?: string;
  limit: number;
  offset: number;
}

export interface AuditReviewRecord {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  branchId: string | null;
  outcome: AuditOutcome;
  metadata: Record<string, unknown>;
  occurredAt: string;
  requestId: string | null;
}

export const auditListMaxLimit = 100;
export const auditExportMaxLimit = 1000;
export const auditMaxOffset = 100000;

export interface AuditReviewRepository {
  list(filters: AuditReviewFilters): Promise<AuditReviewRecord[]>;
  getById(id: string): Promise<AuditReviewRecord | null>;
  exportBounded(filters: AuditReviewFilters): Promise<AuditReviewRecord[]>;
}

interface AuditRow extends QueryResultRow {
  id: unknown;
  actor_user_id: unknown;
  action: unknown;
  target_type: unknown;
  target_id: unknown;
  branch_id: unknown;
  outcome: unknown;
  metadata: unknown;
  occurred_at: unknown;
  request_id: unknown;
}

function mapRow(row: AuditRow): AuditReviewRecord {
  const outcome = String(row.outcome);
  if (outcome !== "SUCCESS" && outcome !== "FAILURE") throw new Error("Invalid audit outcome.");
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {};
  return {
    id: String(row.id),
    actorUserId: row.actor_user_id === null ? null : String(row.actor_user_id),
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: row.target_id === null ? null : String(row.target_id),
    branchId: row.branch_id === null ? null : String(row.branch_id),
    outcome,
    metadata,
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
    requestId: row.request_id === null ? null : String(row.request_id)
  };
}

const selectColumns = `
  SELECT id, actor_user_id, action, target_type, target_id, branch_id,
         outcome, metadata, occurred_at, request_id
  FROM audit_events
`;

export function createAuditReviewRepository(executor: PgQueryExecutor): AuditReviewRepository {
  async function selectMany(filters: AuditReviewFilters, maxLimit: number): Promise<AuditReviewRecord[]> {
    if (
      !Number.isInteger(filters.limit) ||
      filters.limit < 1 ||
      filters.limit > maxLimit ||
      !Number.isInteger(filters.offset) ||
      filters.offset < 0 ||
      filters.offset > auditMaxOffset
    ) {
      throw new Error("Audit review query bounds are invalid.");
    }

    const clauses: string[] = [];
    const values: unknown[] = [];

    function add(value: unknown, sql: (position: number) => string) {
      values.push(value);
      clauses.push(sql(values.length));
    }

    if (filters.action) add(filters.action, (n) => `action = $${n}`);
    if (filters.outcome) add(filters.outcome, (n) => `outcome = $${n}`);
    if (filters.branchId) add(filters.branchId, (n) => `branch_id = $${n}`);
    if (filters.actorUserId) add(filters.actorUserId, (n) => `actor_user_id = $${n}`);
    if (filters.targetType) add(filters.targetType, (n) => `target_type = $${n}`);
    if (filters.occurredFrom) add(filters.occurredFrom, (n) => `occurred_at >= $${n}`);
    if (filters.occurredTo) add(filters.occurredTo, (n) => `occurred_at <= $${n}`);

    values.push(filters.limit);
    const limitPosition = values.length;
    values.push(filters.offset);
    const offsetPosition = values.length;
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const result = await executor.query<AuditRow>(
      `${selectColumns}${where}
       ORDER BY occurred_at DESC, id DESC
       LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
      values
    );
    return result.rows.map(mapRow);
  }

  return {
    async list(filters) {
      return selectMany(filters, auditListMaxLimit);
    },

    async getById(id) {
      const result = await executor.query<AuditRow>(
        `${selectColumns}
         WHERE id = $1
         LIMIT 1`,
        [id]
      );
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    },

    async exportBounded(filters) {
      return selectMany(filters, auditExportMaxLimit);
    }
  };
}
