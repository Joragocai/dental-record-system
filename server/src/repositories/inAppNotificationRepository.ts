import type { PgQueryExecutor } from "../postgres/pool.js";

export interface InAppNotificationRow {
  id: string;
  recipient_user_id: string;
  category: string;
  event_type: string;
  title: string;
  body: string;
  source_type: string | null;
  source_id: string | null;
  branch_id: string | null;
  request_id: string | null;
  read_at: Date | string | null;
  created_at: Date | string;
}

export interface InAppNotificationRecord {
  id: string;
  category: string;
  eventType: string;
  title: string;
  body: string;
  sourceType: string | null;
  sourceId: string | null;
  branchId: string | null;
  requestId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface InAppNotificationRepository {
  listForRecipient(recipientUserId: string, limit: number): Promise<InAppNotificationRecord[]>;
  countUnread(recipientUserId: string): Promise<number>;
  markRead(recipientUserId: string, notificationId: string, readAt: string): Promise<boolean>;
  markAllRead(recipientUserId: string, readAt: string): Promise<number>;
}

function normalizeTimestamp(value: Date | string, fieldName: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid notification database field: ${fieldName}`);
  return date.toISOString();
}

function mapNotification(row: InAppNotificationRow): InAppNotificationRecord {
  if (!row.id || !row.recipient_user_id || !row.category || !row.event_type || !row.title || !row.body) {
    throw new Error("Invalid notification database row.");
  }
  return {
    id: row.id,
    category: row.category,
    eventType: row.event_type,
    title: row.title,
    body: row.body,
    sourceType: row.source_type,
    sourceId: row.source_id,
    branchId: row.branch_id,
    requestId: row.request_id,
    readAt: row.read_at === null ? null : normalizeTimestamp(row.read_at, "read_at"),
    createdAt: normalizeTimestamp(row.created_at, "created_at")
  };
}

const selectColumns = `
  id::text,
  recipient_user_id::text,
  category,
  event_type,
  title,
  body,
  source_type,
  source_id::text,
  branch_id::text,
  request_id::text,
  read_at,
  created_at
`;

export function createInAppNotificationRepository(
  executor: PgQueryExecutor
): InAppNotificationRepository {
  return {
    async listForRecipient(recipientUserId, limit) {
      const result = await executor.query<InAppNotificationRow>(
        `SELECT ${selectColumns}
         FROM notifications
         WHERE recipient_user_id=$1
         ORDER BY created_at DESC, id DESC
         LIMIT $2`,
        [recipientUserId, limit]
      );
      return result.rows.map(mapNotification);
    },

    async countUnread(recipientUserId) {
      const result = await executor.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM notifications
         WHERE recipient_user_id=$1
           AND read_at IS NULL`,
        [recipientUserId]
      );
      const count = Number(result.rows[0]?.count ?? 0);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error("Invalid notification unread count.");
      }
      return count;
    },

    async markRead(recipientUserId, notificationId, readAt) {
      const result = await executor.query(
        `UPDATE notifications
         SET read_at=COALESCE(read_at, $3::timestamptz)
         WHERE id=$1
           AND recipient_user_id=$2
         RETURNING id`,
        [notificationId, recipientUserId, readAt]
      );
      return result.rowCount === 1;
    },

    async markAllRead(recipientUserId, readAt) {
      const result = await executor.query(
        `UPDATE notifications
         SET read_at=$2::timestamptz
         WHERE recipient_user_id=$1
           AND read_at IS NULL`,
        [recipientUserId, readAt]
      );
      return result.rowCount ?? 0;
    }
  };
}
