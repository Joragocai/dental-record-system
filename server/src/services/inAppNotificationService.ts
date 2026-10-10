import type { PgQueryExecutor } from "../postgres/pool.js";
import {
  createInAppNotificationRepository,
  type InAppNotificationRecord,
  type InAppNotificationRepository
} from "../repositories/inAppNotificationRepository.js";
import {
  InAppNotificationError,
  toInAppNotificationPersistenceError
} from "./inAppNotificationErrors.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface InAppNotificationService {
  list(recipientUserId: string, limitValue?: unknown): Promise<InAppNotificationRecord[]>;
  unreadCount(recipientUserId: string): Promise<number>;
  markRead(recipientUserId: string, notificationId: string): Promise<{ read: true }>;
  markAllRead(recipientUserId: string): Promise<{ markedRead: number }>;
}

export interface InAppNotificationServiceOptions {
  now?: () => Date;
  repositoryFactory?: (executor: PgQueryExecutor) => InAppNotificationRepository;
}

function requireUuid(value: unknown): string {
  if (typeof value !== "string") throw new InAppNotificationError("NOTIFICATION_INPUT_INVALID");
  const normalized = value.trim().toLowerCase();
  if (!uuidPattern.test(normalized)) throw new InAppNotificationError("NOTIFICATION_INPUT_INVALID");
  return normalized;
}

function normalizeLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return 50;
  const raw = typeof value === "string" ? value.trim() : value;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new InAppNotificationError("NOTIFICATION_INPUT_INVALID");
  }
  return parsed;
}

export function createInAppNotificationService(
  executor: PgQueryExecutor,
  options: InAppNotificationServiceOptions = {}
): InAppNotificationService {
  const repository = (options.repositoryFactory ?? createInAppNotificationRepository)(executor);
  const now = options.now ?? (() => new Date());

  return {
    async list(recipientUserIdValue, limitValue) {
      const recipientUserId = requireUuid(recipientUserIdValue);
      const limit = normalizeLimit(limitValue);
      try {
        return await repository.listForRecipient(recipientUserId, limit);
      } catch (error) {
        throw toInAppNotificationPersistenceError(error);
      }
    },

    async unreadCount(recipientUserIdValue) {
      const recipientUserId = requireUuid(recipientUserIdValue);
      try {
        return await repository.countUnread(recipientUserId);
      } catch (error) {
        throw toInAppNotificationPersistenceError(error);
      }
    },

    async markRead(recipientUserIdValue, notificationIdValue) {
      const recipientUserId = requireUuid(recipientUserIdValue);
      const notificationId = requireUuid(notificationIdValue);
      try {
        const found = await repository.markRead(recipientUserId, notificationId, now().toISOString());
        if (!found) throw new InAppNotificationError("NOTIFICATION_NOT_FOUND");
        return { read: true };
      } catch (error) {
        throw toInAppNotificationPersistenceError(error);
      }
    },

    async markAllRead(recipientUserIdValue) {
      const recipientUserId = requireUuid(recipientUserIdValue);
      try {
        return {
          markedRead: await repository.markAllRead(recipientUserId, now().toISOString())
        };
      } catch (error) {
        throw toInAppNotificationPersistenceError(error);
      }
    }
  };
}
