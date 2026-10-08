import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { AuthenticationError } from "../auth/authErrors.ts";
import { AuthorizationError } from "../services/authorizationErrors.ts";
import { createRequestIdMiddleware } from "../middleware/requestId.ts";
import { createAuditEventsRouter } from "./auditEvents.js";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const actorAuthUserId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const auditEventId = "44444444-4444-4444-8444-444444444444";

async function withServer({ accessBoundary, auditRuntime }, callback) {
  const authenticationService = {
    async authenticateAuthorizationHeader(header) {
      if (!header) throw new AuthenticationError("CREDENTIALS_MISSING");
      return {
        subject: actorAuthUserId,
        email: "owner@example.test",
        audience: "authenticated",
        provider: "supabase"
      };
    }
  };

  const app = express();
  app.use(express.json());
  app.use(createRequestIdMiddleware({ createId: () => requestId }));
  app.use("/api/audit-events", createAuditEventsRouter(authenticationService, accessBoundary, auditRuntime));
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

function allowedBoundary(calls) {
  return {
    async resolveApplicationUser(_req, res, next) {
      calls.push("application-user");
      res.locals.applicationUser = {
        userId: actorUserId,
        authUserId: actorAuthUserId,
        roles: ["CLINIC_ADMINISTRATOR"],
        branchIds: []
      };
      next();
    },
    async resolveAuthorization(_req, res, next) {
      calls.push("authorization");
      res.locals.authorization = { permissions: [] };
      next();
    },
    requirePermission(permission) {
      return async (_req, _res, next) => {
        calls.push(`permission:${permission}`);
        next();
      };
    },
    requireBranchPermission() {
      return async (_req, _res, next) => next();
    }
  };
}

test("GET /api/audit-events requires audit.read and forwards trusted actor/request context", async () => {
  const calls = [];
  let received = null;
  const accessBoundary = allowedBoundary(calls);
  const auditRuntime = {
    getService: () => ({
      async list(input, actor) {
        received = { input, actor };
        return { items: [], limit: 50, offset: 0 };
      },
      async detail() { throw new Error("not used"); },
      async exportCsv() { throw new Error("not used"); }
    })
  };

  await withServer({ accessBoundary, auditRuntime }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/audit-events?action=USER_ACTIVATED`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), requestId);
    assert.deepEqual(await response.json(), { items: [], limit: 50, offset: 0 });
  });

  assert.deepEqual(calls, ["application-user", "authorization", "permission:audit.read"]);
  assert.equal(received.actor.userId, actorUserId);
  assert.equal(received.actor.authUserId, actorAuthUserId);
  assert.equal(received.actor.requestId, requestId);
  assert.equal(received.input.action, "USER_ACTIVATED");
});

test("GET /api/audit-events/:id requires audit.read", async () => {
  const calls = [];
  let receivedId = null;
  const accessBoundary = allowedBoundary(calls);
  const auditRuntime = {
    getService: () => ({
      async list() { throw new Error("not used"); },
      async detail(id) {
        receivedId = id;
        return { id, action: "USER_ACTIVATED" };
      },
      async exportCsv() { throw new Error("not used"); }
    })
  };

  await withServer({ accessBoundary, auditRuntime }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/audit-events/${auditEventId}`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).id, auditEventId);
  });

  assert.equal(receivedId, auditEventId);
  assert.deepEqual(calls, ["application-user", "authorization", "permission:audit.read"]);
});

test("POST /api/audit-events/export requires audit.export and returns bounded CSV response", async () => {
  const calls = [];
  let received = null;
  const accessBoundary = allowedBoundary(calls);
  const auditRuntime = {
    getService: () => ({
      async list() { throw new Error("not used"); },
      async detail() { throw new Error("not used"); },
      async exportCsv(input, actor) {
        received = { input, actor };
        return '"id","action"\n"1","USER_ACTIVATED"\n';
      }
    })
  };

  await withServer({ accessBoundary, auditRuntime }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/audit-events/export`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
        "content-type": "application/json"
      },
      body: JSON.stringify({ limit: 100 })
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/csv/);
    assert.match(response.headers.get("content-disposition") ?? "", /audit-events\.csv/);
    assert.match(await response.text(), /USER_ACTIVATED/);
  });

  assert.deepEqual(calls, ["application-user", "authorization", "permission:audit.export"]);
  assert.equal(received.input.limit, 100);
  assert.equal(received.actor.requestId, requestId);
});

test("audit routes preserve authorization denial and never call the review service", async () => {
  const calls = [];
  let serviceCalls = 0;
  const accessBoundary = allowedBoundary(calls);
  accessBoundary.requirePermission = (permission) => async (_req, _res, next) => {
    calls.push(`permission:${permission}`);
    next(new AuthorizationError("AUTHORIZATION_DENIED"));
  };
  const auditRuntime = {
    getService: () => ({
      async list() { serviceCalls += 1; },
      async detail() { serviceCalls += 1; },
      async exportCsv() { serviceCalls += 1; }
    })
  };

  await withServer({ accessBoundary, auditRuntime }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/audit-events`, {
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { message: "You are not authorized to perform this action." });
  });

  assert.equal(serviceCalls, 0);
});

test("audit routes require authentication before access resolution", async () => {
  const calls = [];
  const accessBoundary = allowedBoundary(calls);
  const auditRuntime = {
    getService: () => ({
      async list() { throw new Error("not used"); },
      async detail() { throw new Error("not used"); },
      async exportCsv() { throw new Error("not used"); }
    })
  };

  await withServer({ accessBoundary, auditRuntime }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/audit-events`);
    assert.equal(response.status, 401);
  });

  assert.deepEqual(calls, []);
});
