import { authenticatedV2Fetch, type AuthenticatedFetchOptions } from "../auth/authApi.js";

export interface InAppNotification {
  id: string;
  category: string;
  eventType: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationApiError extends Error {
  status: number;
}

function createApiError(status: number, message: string): NotificationApiError {
  const error = new Error(message) as NotificationApiError;
  error.name = "NotificationApiError";
  error.status = status;
  return error;
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let message = fallbackMessage;
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string" && payload.message.trim()) message = payload.message.trim();
    } catch {
      // Keep the safe fallback.
    }
    throw createApiError(response.status, message);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw createApiError(502, "The notification service returned an invalid response.");
  }
}

function parseNotification(value: unknown): InAppNotification {
  if (!value || typeof value !== "object") {
    throw createApiError(502, "The notification service returned an invalid notification.");
  }
  const record = value as Record<string, unknown>;
  for (const key of ["id", "category", "eventType", "title", "body", "createdAt"] as const) {
    if (typeof record[key] !== "string" || !String(record[key]).trim()) {
      throw createApiError(502, "The notification service returned an invalid notification.");
    }
  }
  if (record.readAt !== null && typeof record.readAt !== "string") {
    throw createApiError(502, "The notification service returned an invalid notification.");
  }
  return {
    id: String(record.id),
    category: String(record.category),
    eventType: String(record.eventType),
    title: String(record.title),
    body: String(record.body),
    readAt: record.readAt === null ? null : String(record.readAt),
    createdAt: String(record.createdAt)
  };
}

export async function listNotifications(
  options: AuthenticatedFetchOptions,
  limit = 50
): Promise<InAppNotification[]> {
  const response = await authenticatedV2Fetch(
    `/notifications?limit=${encodeURIComponent(String(limit))}`,
    { method: "GET" },
    options
  );
  const payload = await readJson<unknown>(response, "Unable to load notifications.");
  if (!Array.isArray(payload)) {
    throw createApiError(502, "The notification service returned an invalid notification list.");
  }
  return payload.map(parseNotification);
}

export async function getUnreadNotificationCount(
  options: AuthenticatedFetchOptions
): Promise<number> {
  const response = await authenticatedV2Fetch("/notifications/unread-count", { method: "GET" }, options);
  const payload = await readJson<{ unread?: unknown }>(response, "Unable to load notification count.");
  if (!Number.isSafeInteger(payload.unread) || Number(payload.unread) < 0) {
    throw createApiError(502, "The notification service returned an invalid unread count.");
  }
  return Number(payload.unread);
}

export async function markNotificationRead(
  notificationId: string,
  options: AuthenticatedFetchOptions
): Promise<void> {
  const response = await authenticatedV2Fetch(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "PATCH" },
    options
  );
  const payload = await readJson<{ read?: unknown }>(response, "Unable to mark the notification as read.");
  if (payload.read !== true) {
    throw createApiError(502, "The notification service returned an invalid read acknowledgement.");
  }
}

export async function markAllNotificationsRead(
  options: AuthenticatedFetchOptions
): Promise<number> {
  const response = await authenticatedV2Fetch("/notifications/read-all", { method: "POST" }, options);
  const payload = await readJson<{ markedRead?: unknown }>(response, "Unable to mark notifications as read.");
  if (!Number.isSafeInteger(payload.markedRead) || Number(payload.markedRead) < 0) {
    throw createApiError(502, "The notification service returned an invalid read count.");
  }
  return Number(payload.markedRead);
}
