import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { AuthenticationError } from "../auth/authErrors.ts";
import { InAppNotificationError } from "../services/inAppNotificationErrors.ts";
import { createRequestIdMiddleware } from "../middleware/requestId.ts";
import { createNotificationsRouter } from "./notifications.js";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const actorAuthUserId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const notificationId = "44444444-4444-4444-8444-444444444444";
const otherNotificationId = "55555555-5555-4555-8555-555555555555";

function authService() {
  return {
    async authenticateAuthorizationHeader(header) {
      if (!header) throw new AuthenticationError("CREDENTIALS_MISSING");
      return {
        subject: actorAuthUserId,
        email: "personnel@example.test",
        audience: "authenticated",
        provider: "supabase"
      };
    }
  };
}

function recipientBoundary(calls) {
  return {
    async resolveApplicationUser(_req, res, next) {
      calls.push("application-user");
      res.locals.applicationUser = {
        userId: actorUserId,
        authUserId: actorAuthUserId,
        email: "personnel@example.test",
        displayName: "Fictional Personnel",
        status: "active",
        roles: ["PERSONNEL"],
        branchIds: []
      };
      next();
    },
    async resolveAuthorization(_req, _res, next) {
      calls.push("authorization");
      next(new Error("Notification routes must not resolve authorization."));
    },
    requirePermission() {
      throw new Error("Notification routes must not request role permissions.");
    },
    requireAnyBranchPermission() {
      throw new Error("Notification routes must not request branch permissions.");
    },
    requireBranchPermission() {
      throw new Error("Notification routes must not request branch permissions.");
    }
  };
}

function createRuntime(overrides = {}) {
  const calls = [];
  const service = {
    async list(userId, limit) {
      calls.push({ method: "list", userId, limit });
      return [{
        id: notificationId,
        category: "account",
        eventType: "ACCOUNT_TEST",
        title: "Account update",
        body: "Your account has an update.",
        sourceType: null,
        sourceId: null,
        branchId: null,
        requestId,
        readAt: null,
        createdAt: "2026-10-10T00:00:00.000Z"
      }];
    },
    async unreadCount(userId) {
      calls.push({ method: "unread", userId });
      return 1;
    },
    async markRead(userId, id) {
      calls.push({ method: "read", userId, id });
      if (id === otherNotificationId) throw new InAppNotificationError("NOTIFICATION_NOT_FOUND");
      return { read: true };
    },
    async markAllRead(userId) {
      calls.push({ method: "read-all", userId });
      return { markedRead: 1 };
    },
    ...overrides
  };

  return {
    calls,
    runtime: {
      getService: () => service,
      async shutdown() {}
    }
  };
}

async function withServer({ boundary, runtime }, callback) {
  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware({ createId: () => requestId }));
  app.use("/api/notifications", createNotificationsRouter(authService(), boundary, runtime));
  app.use((error, _req, res, _next) => {
    if (error?.status) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: "Internal server error." });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("notification routes require authentication before recipient resolution", async () => {
  const accessCalls = [];
  const harness = createRuntime();
  await withServer({
    boundary: recipientBoundary(accessCalls),
    runtime: harness.runtime
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/notifications`);
    assert.equal(response.status, 401);
  });
  assert.deepEqual(accessCalls, []);
  assert.deepEqual(harness.calls, []);
});

test("list and unread count use only the resolved application-user recipient", async () => {
  const accessCalls = [];
  const harness = createRuntime();
  await withServer({
    boundary: recipientBoundary(accessCalls),
    runtime: harness.runtime
  }, async (baseUrl) => {
    const list = await fetch(
      `${baseUrl}/api/notifications?limit=20&recipientUserId=${otherNotificationId}`,
      { headers: { Authorization: "Bearer token" } }
    );
    assert.equal(list.status, 200);
    const listPayload = await list.json();
    assert.deepEqual(listPayload, [{
      id: notificationId,
      category: "account",
      eventType: "ACCOUNT_TEST",
      title: "Account update",
      body: "Your account has an update.",
      readAt: null,
      createdAt: "2026-10-10T00:00:00.000Z"
    }]);
    assert.equal("requestId" in listPayload[0], false);
    assert.equal("sourceId" in listPayload[0], false);
    assert.equal("branchId" in listPayload[0], false);

    const unread = await fetch(`${baseUrl}/api/notifications/unread-count`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(unread.status, 200);
    assert.deepEqual(await unread.json(), { unread: 1 });
  });

  assert.deepEqual(accessCalls, ["application-user", "application-user"]);
  assert.deepEqual(harness.calls, [
    { method: "list", userId: actorUserId, limit: "20" },
    { method: "unread", userId: actorUserId }
  ]);
});

test("read actions are recipient-owned and another user's notification is hidden as 404", async () => {
  const accessCalls = [];
  const harness = createRuntime();
  await withServer({
    boundary: recipientBoundary(accessCalls),
    runtime: harness.runtime
  }, async (baseUrl) => {
    const own = await fetch(`${baseUrl}/api/notifications/${notificationId}/read`, {
      method: "PATCH",
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(own.status, 200);
    assert.deepEqual(await own.json(), { read: true });

    const other = await fetch(`${baseUrl}/api/notifications/${otherNotificationId}/read`, {
      method: "PATCH",
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(other.status, 404);
    assert.deepEqual(await other.json(), { message: "Notification was not found." });

    const all = await fetch(`${baseUrl}/api/notifications/read-all`, {
      method: "POST",
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(all.status, 200);
    assert.deepEqual(await all.json(), { markedRead: 1 });
  });

  assert.deepEqual(harness.calls, [
    { method: "read", userId: actorUserId, id: notificationId },
    { method: "read", userId: actorUserId, id: otherNotificationId },
    { method: "read-all", userId: actorUserId }
  ]);
  assert.equal(accessCalls.includes("authorization"), false);
});

test("invalid list limit is returned as safe 400", async () => {
  const accessCalls = [];
  const harness = createRuntime({
    async list() {
      throw new InAppNotificationError("NOTIFICATION_INPUT_INVALID");
    }
  });

  await withServer({
    boundary: recipientBoundary(accessCalls),
    runtime: harness.runtime
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/notifications?limit=999`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: "Notification request is invalid." });
  });
});
