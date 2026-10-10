import express from "express";
import { createAuthenticateMiddleware } from "../auth/authMiddleware.js";
import { createAccessBoundary } from "../access/accessMiddleware.js";
import { createInAppNotificationRuntime } from "../notifications/inAppNotificationRuntime.js";
import { InAppNotificationError } from "../services/inAppNotificationErrors.js";

function recipientUserIdFromResponse(res) {
  const userId = res.locals.applicationUser?.userId;
  if (!userId) {
    const error = new Error("Notification access context is unavailable.");
    error.status = 500;
    throw error;
  }
  return userId;
}

function toNotificationHttpError(error) {
  if (error instanceof InAppNotificationError) {
    const mapped = new Error(
      error.code === "NOTIFICATION_INPUT_INVALID"
        ? "Notification request is invalid."
        : error.code === "NOTIFICATION_NOT_FOUND"
          ? "Notification was not found."
          : "Notifications are temporarily unavailable."
    );
    mapped.status =
      error.code === "NOTIFICATION_INPUT_INVALID"
        ? 400
        : error.code === "NOTIFICATION_NOT_FOUND"
          ? 404
          : 503;
    return mapped;
  }
  return error;
}

function toPublicNotification(notification) {
  return {
    id: notification.id,
    category: notification.category,
    eventType: notification.eventType,
    title: notification.title,
    body: notification.body,
    readAt: notification.readAt,
    createdAt: notification.createdAt
  };
}

function handleNotification(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(toNotificationHttpError(error));
    }
  };
}

export function createNotificationsRouter(
  authenticationService,
  accessBoundary = createAccessBoundary(),
  notificationRuntime = createInAppNotificationRuntime()
) {
  const router = express.Router();
  const authenticate = createAuthenticateMiddleware(authenticationService);
  const resolveRecipient = [authenticate, accessBoundary.resolveApplicationUser];

  router.get(
    "/",
    ...resolveRecipient,
    handleNotification(async (req, res) => {
      const notifications = await notificationRuntime
        .getService()
        .list(recipientUserIdFromResponse(res), req.query?.limit);
      res.json(notifications.map(toPublicNotification));
    })
  );

  router.get(
    "/unread-count",
    ...resolveRecipient,
    handleNotification(async (_req, res) => {
      const unread = await notificationRuntime
        .getService()
        .unreadCount(recipientUserIdFromResponse(res));
      res.json({ unread });
    })
  );

  router.patch(
    "/:notificationId/read",
    ...resolveRecipient,
    handleNotification(async (req, res) => {
      const result = await notificationRuntime
        .getService()
        .markRead(recipientUserIdFromResponse(res), req.params.notificationId);
      res.json(result);
    })
  );

  router.post(
    "/read-all",
    ...resolveRecipient,
    handleNotification(async (_req, res) => {
      const result = await notificationRuntime
        .getService()
        .markAllRead(recipientUserIdFromResponse(res));
      res.json(result);
    })
  );

  return router;
}

export default createNotificationsRouter;
