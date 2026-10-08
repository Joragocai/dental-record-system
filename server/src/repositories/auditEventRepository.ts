import type { PgQueryExecutor } from "../postgres/pool.js";

export type AuditOutcome = "SUCCESS" | "FAILURE";

export interface AuditEventRecord {
  id: string;
  actorUserId: string | null;
  actorAuthUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  branchId: string | null;
  outcome: AuditOutcome;
  metadata: Record<string, unknown>;
  occurredAt: string;
  requestId?: string | null;
}

export interface AuditEventRepository {
  insert(event: AuditEventRecord): Promise<void>;
}

export function createAuditEventRepository(executor: PgQueryExecutor): AuditEventRepository {
  return {
    async insert(event) {
      await executor.query(
        `INSERT INTO audit_events (
           id, actor_user_id, actor_auth_user_id, action, target_type,
           target_id, branch_id, outcome, metadata, occurred_at, request_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
        [
          event.id,
          event.actorUserId,
          event.actorAuthUserId,
          event.action,
          event.targetType,
          event.targetId,
          event.branchId,
          event.outcome,
          JSON.stringify(event.metadata),
          event.occurredAt,
          event.requestId ?? null
        ]
      );
    }
  };
}
