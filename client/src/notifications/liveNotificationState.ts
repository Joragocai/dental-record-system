import type { InAppNotification } from "./notificationApi.js";

export type NotificationSnapshot = Pick<InAppNotification, "id" | "readAt" | "createdAt">;

/**
 * A first successful poll establishes a baseline and never replays old
 * notifications. Only newer, recipient-owned unread records trigger a toast.
 */
export function countNewUnreadNotifications(
  previous: readonly NotificationSnapshot[] | null,
  current: readonly NotificationSnapshot[]
): number {
  if (previous === null) return 0;

  const previousIds = new Set(previous.map((notification) => notification.id));
  const newestPreviousTimestamp = previous.reduce((latest, notification) => {
    const timestamp = Date.parse(notification.createdAt);
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, Number.NEGATIVE_INFINITY);

  return current.filter((notification) => {
    if (notification.readAt !== null || previousIds.has(notification.id)) return false;
    const timestamp = Date.parse(notification.createdAt);
    // UUID identity disambiguates distinct rows serialized at the same millisecond.
    return Number.isFinite(timestamp) && timestamp >= newestPreviousTimestamp;
  }).length;
}
