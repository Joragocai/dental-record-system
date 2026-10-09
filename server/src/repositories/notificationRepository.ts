import type { PgQueryExecutor } from "../postgres/pool.js";

export type NotificationCategory = "appointment" | "account" | "security" | "system";

export interface EmailDeliveryIntentRecord {
  id: string;
  notificationId: string | null;
  recipientUserId: string | null;
  recipientPatientId: string | null;
  category: NotificationCategory;
  eventType: string;
  templateKey: string;
  sourceType: string | null;
  sourceId: string | null;
  branchId: string | null;
  requestId: string | null;
  dedupeKey: string;
  createdAt: string;
}

export interface NotificationRepository {
  patientHasEmail(patientId: string): Promise<boolean>;
  insertEmailDeliveryIntent(record: EmailDeliveryIntentRecord): Promise<void>;
}

export function createNotificationRepository(executor: PgQueryExecutor): NotificationRepository {
  return {
    async patientHasEmail(patientId) {
      const result = await executor.query(
        `SELECT 1
         FROM patients
         WHERE id = $1
           AND email_address IS NOT NULL
           AND length(trim(email_address)) > 0
         LIMIT 1`,
        [patientId]
      );
      return result.rowCount === 1;
    },

    async insertEmailDeliveryIntent(record) {
      await executor.query(
        `INSERT INTO email_delivery_logs (
           id, notification_id, recipient_user_id, recipient_patient_id,
           category, event_type, template_key, source_type, source_id,
           branch_id, status, attempt_count, request_id, dedupe_key,
           created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
           'pending',0,$11,$12,$13,$13
         )
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [
          record.id,
          record.notificationId,
          record.recipientUserId,
          record.recipientPatientId,
          record.category,
          record.eventType,
          record.templateKey,
          record.sourceType,
          record.sourceId,
          record.branchId,
          record.requestId,
          record.dedupeKey,
          record.createdAt
        ]
      );
    }
  };
}
