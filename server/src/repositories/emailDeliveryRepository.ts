import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";

export type EmailDeliveryStatus = "pending" | "processing" | "failed" | "sent" | "abandoned";

export interface ClaimedEmailDelivery {
  id: string;
  recipientUserId: string | null;
  recipientPatientId: string | null;
  category: string;
  eventType: string;
  templateKey: string;
  sourceType: string | null;
  sourceId: string | null;
  branchId: string | null;
  requestId: string | null;
  dedupeKey: string;
  attemptCount: number;
  claimedAt: string;
  createdAt: string;
}

export interface EmailDeliveryRepository {
  abandonExhausted(now: string, maxAttempts: number): Promise<number>;
  claimNext(now: string, leaseSeconds: number, maxAttempts: number): Promise<ClaimedEmailDelivery | null>;
  resolveRecipientEmail(delivery: ClaimedEmailDelivery): Promise<string | null>;
  markSent(
    delivery: ClaimedEmailDelivery,
    sentAt: string,
    providerMessageId: string
  ): Promise<boolean>;
  markFailure(
    delivery: ClaimedEmailDelivery,
    failedAt: string,
    status: "failed" | "abandoned",
    errorCode: string,
    nextAttemptAt: string | null
  ): Promise<boolean>;
}

interface DeliveryRow {
  id: string;
  recipient_user_id: string | null;
  recipient_patient_id: string | null;
  category: string;
  event_type: string;
  template_key: string;
  source_type: string | null;
  source_id: string | null;
  branch_id: string | null;
  request_id: string | null;
  dedupe_key: string;
  attempt_count: number;
  last_attempt_at: Date | string;
  created_at: Date | string;
}

function toIsoTimestamp(value: Date | string, fieldName: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid email delivery database field: ${fieldName}`);
  return date.toISOString();
}

function mapDelivery(row: DeliveryRow): ClaimedEmailDelivery {
  if (!row.id || !row.dedupe_key || !row.template_key || !row.event_type) {
    throw new Error("Invalid email delivery database row.");
  }
  if (!Number.isInteger(row.attempt_count) || row.attempt_count < 1) {
    throw new Error("Invalid email delivery database field: attempt_count");
  }
  const hasUser = Boolean(row.recipient_user_id);
  const hasPatient = Boolean(row.recipient_patient_id);
  if (hasUser === hasPatient) throw new Error("Invalid email delivery recipient state.");

  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    recipientPatientId: row.recipient_patient_id,
    category: row.category,
    eventType: row.event_type,
    templateKey: row.template_key,
    sourceType: row.source_type,
    sourceId: row.source_id,
    branchId: row.branch_id,
    requestId: row.request_id,
    dedupeKey: row.dedupe_key,
    attemptCount: row.attempt_count,
    claimedAt: toIsoTimestamp(row.last_attempt_at, "last_attempt_at"),
    createdAt: toIsoTimestamp(row.created_at, "created_at")
  };
}

export function createEmailDeliveryRepository(pool: PgPoolManager): EmailDeliveryRepository {
  return {
    async abandonExhausted(now, maxAttempts) {
      const result = await pool.query(
        `UPDATE email_delivery_logs
         SET status='abandoned',
             lease_expires_at=NULL,
             next_attempt_at=NULL,
             last_error_code='MAX_ATTEMPTS_EXHAUSTED',
             updated_at=$1::timestamptz
         WHERE attempt_count >= $2
           AND (
             status IN ('pending', 'failed')
             OR (
               status='processing'
               AND lease_expires_at IS NOT NULL
               AND lease_expires_at <= $1::timestamptz
             )
           )`,
        [now, maxAttempts]
      );
      return result.rowCount ?? 0;
    },

    async claimNext(now, leaseSeconds, maxAttempts) {
      return pool.withTransaction(async (executor: PgQueryExecutor) => {
        const result = await executor.query<DeliveryRow>(
          `WITH candidate AS (
             SELECT id
             FROM email_delivery_logs
             WHERE attempt_count < $2
               AND (
                 status='pending'
                 OR (
                   status='failed'
                   AND (next_attempt_at IS NULL OR next_attempt_at <= $1::timestamptz)
                 )
                 OR (
                   status='processing'
                   AND lease_expires_at IS NOT NULL
                   AND lease_expires_at <= $1::timestamptz
                 )
               )
             ORDER BY COALESCE(next_attempt_at, created_at), created_at, id
             FOR UPDATE SKIP LOCKED
             LIMIT 1
           )
           UPDATE email_delivery_logs d
           SET status='processing',
               attempt_count=d.attempt_count + 1,
               next_attempt_at=NULL,
               lease_expires_at=$1::timestamptz + make_interval(secs => $3),
               last_attempt_at=$1::timestamptz,
               last_error_code=NULL,
               updated_at=$1::timestamptz
           FROM candidate
           WHERE d.id=candidate.id
           RETURNING
             d.id::text,
             d.recipient_user_id::text,
             d.recipient_patient_id::text,
             d.category,
             d.event_type,
             d.template_key,
             d.source_type,
             d.source_id::text,
             d.branch_id::text,
             d.request_id::text,
             d.dedupe_key,
             d.attempt_count,
             d.last_attempt_at,
             d.created_at`,
          [now, maxAttempts, leaseSeconds]
        );
        return result.rows[0] ? mapDelivery(result.rows[0]) : null;
      });
    },

    async resolveRecipientEmail(delivery) {
      if (delivery.recipientPatientId) {
        const result = await pool.query<{ email_address: string | null }>(
          "SELECT email_address FROM patients WHERE id=$1 LIMIT 1",
          [delivery.recipientPatientId]
        );
        return result.rows[0]?.email_address ?? null;
      }

      const result = await pool.query<{ email: string | null }>(
        "SELECT email FROM app_users WHERE id=$1 LIMIT 1",
        [delivery.recipientUserId]
      );
      return result.rows[0]?.email ?? null;
    },

    async markSent(delivery, sentAt, providerMessageId) {
      const result = await pool.query(
        `UPDATE email_delivery_logs
         SET status='sent',
             sent_at=$2::timestamptz,
             lease_expires_at=NULL,
             next_attempt_at=NULL,
             provider_message_id=$3,
             last_error_code=NULL,
             updated_at=$2::timestamptz
         WHERE id=$1
           AND status='processing'
           AND last_attempt_at=$4::timestamptz`,
        [delivery.id, sentAt, providerMessageId, delivery.claimedAt]
      );
      return result.rowCount === 1;
    },

    async markFailure(delivery, failedAt, status, errorCode, nextAttemptAt) {
      const result = await pool.query(
        `UPDATE email_delivery_logs
         SET status=$2,
             lease_expires_at=NULL,
             next_attempt_at=$3::timestamptz,
             last_error_code=$4,
             updated_at=$5::timestamptz
         WHERE id=$1
           AND status='processing'
           AND last_attempt_at=$6::timestamptz`,
        [delivery.id, status, nextAttemptAt, errorCode, failedAt, delivery.claimedAt]
      );
      return result.rowCount === 1;
    }
  };
}
