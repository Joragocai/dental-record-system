import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { AuthenticationError } from "../auth/authErrors.ts";
import { AuthorizationError } from "../services/authorizationErrors.ts";
import { createRequestIdMiddleware } from "../middleware/requestId.ts";
import { createStaffAccountsRouter } from "./staffAccounts.js";

const requestId = "99999999-9999-4999-8999-999999999999";

async function withServer({ authenticationService, accessBoundary, staffAccountRuntime, staffProvisioningRuntime }, callback) {
  const app = express();
  app.use(createRequestIdMiddleware({ createId: () => requestId }));
  app.use(express.json());
  app.use("/api/staff-accounts", createStaffAccountsRouter(authenticationService, accessBoundary, staffAccountRuntime, staffProvisioningRuntime));
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
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function buildAllowedAccessBoundary(calls) {
  return {
    async resolveApplicationUser(_req, res, next) {
      calls.push("application-user");
      res.locals.applicationUser = {
        userId: "11111111-1111-4111-8111-111111111111",
        authUserId: "22222222-2222-4222-8222-222222222222",
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
      return (_req, _res, next) => {
        calls.push(`permission:${permission}`);
        next();
      };
    },
    requireBranchPermission() {
      return (_req, _res, next) => next();
    }
  };
}

const authService = {
  async authenticateAuthorizationHeader(header) {
    if (!header) throw new AuthenticationError("CREDENTIALS_MISSING");
    return {
      subject: "22222222-2222-4222-8222-222222222222",
      email: "admin@example.test",
      audience: "authenticated",
      provider: "supabase"
    };
  }
};

test("POST /api/staff-accounts requires authentication before access checks", async () => {
  const accessCalls = [];
  let createCalls = 0;
  await withServer({
    authenticationService: authService,
    accessBoundary: buildAllowedAccessBoundary(accessCalls),
    staffAccountRuntime: { getService: () => ({ async createPendingStaffAccount() { createCalls += 1; } }) }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/staff-accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
  });
  assert.deepEqual(accessCalls, []);
  assert.equal(createCalls, 0);
});

test("POST /api/staff-accounts requires both staff creation and role approval permissions", async () => {
  const calls = [];
  let createCalls = 0;
  const accessBoundary = buildAllowedAccessBoundary(calls);
  let permissionCount = 0;
  accessBoundary.requirePermission = (permission) => (_req, _res, next) => {
    calls.push(`permission:${permission}`);
    permissionCount += 1;
    if (permissionCount === 2) {
      next(new AuthorizationError("AUTHORIZATION_DENIED"));
      return;
    }
    next();
  };

  await withServer({
    authenticationService: authService,
    accessBoundary,
    staffAccountRuntime: { getService: () => ({ async createPendingStaffAccount() { createCalls += 1; } }) }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/staff-accounts`, {
      method: "POST",
      headers: { Authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Staff", email: "staff@example.test", roles: ["PERSONNEL"], branchIds: [] })
    });
    assert.equal(response.status, 403);
  });

  assert.deepEqual(calls, [
    "application-user",
    "authorization",
    "permission:staff_account.create",
    "permission:role_assignment.approve"
  ]);
  assert.equal(createCalls, 0);
});

test("POST /api/staff-accounts/:userId/invite requires both provisioning permissions and returns a safe invitation result", async () => {
  const calls = [];
  let received = null;
  const targetId = "33333333-3333-4333-8333-333333333333";

  await withServer({
    authenticationService: authService,
    accessBoundary: buildAllowedAccessBoundary(calls),
    staffAccountRuntime: { getService: () => ({ async createPendingStaffAccount() { throw new Error("not used"); } }) },
    staffProvisioningRuntime: {
      getService: () => ({
        async invitePendingStaff(input) {
          received = input;
          return { id: targetId, status: "pending", invitation: "sent" };
        },
        async activateInvitedStaff() { throw new Error("not used"); }
      })
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/staff-accounts/${targetId}/invite`, {
      method: "POST",
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { id: targetId, status: "pending", invitation: "sent" });
  });

  assert.deepEqual(calls, [
    "application-user",
    "authorization",
    "permission:staff_account.create",
    "permission:role_assignment.approve"
  ]);
  assert.equal(received.targetUserId, targetId);
  assert.equal(received.requestId, requestId);
});

test("POST /api/staff-accounts/activate uses authenticated provider identity without active-user middleware", async () => {
  const accessCalls = [];
  let received = null;

  await withServer({
    authenticationService: authService,
    accessBoundary: buildAllowedAccessBoundary(accessCalls),
    staffAccountRuntime: { getService: () => ({ async createPendingStaffAccount() { throw new Error("not used"); } }) },
    staffProvisioningRuntime: {
      getService: () => ({
        async invitePendingStaff() { throw new Error("not used"); },
        async activateInvitedStaff(input) {
          received = input;
          return { activated: true };
        }
      })
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/staff-accounts/activate`, {
      method: "POST",
      headers: { Authorization: "Bearer token" }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { activated: true });
  });

  assert.deepEqual(accessCalls, []);
  assert.deepEqual(received, {
    authUserId: "22222222-2222-4222-8222-222222222222",
    email: "admin@example.test",
    requestId
  });
});

test("POST /api/staff-accounts returns only the safe pending staff summary", async () => {
  const calls = [];
  const created = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "staff@example.test",
    displayName: "Fictional Staff",
    status: "pending",
    roles: ["PERSONNEL"],
    branchIds: ["33333333-3333-4333-8333-333333333333"]
  };
  let receivedBody = null;
  let receivedActor = null;

  await withServer({
    authenticationService: authService,
    accessBoundary: buildAllowedAccessBoundary(calls),
    staffAccountRuntime: {
      getService: () => ({
        async createPendingStaffAccount(input, actor) {
          receivedBody = input;
          receivedActor = actor;
          return created;
        }
      })
    }
  }, async (baseUrl) => {
    const body = {
      displayName: "Fictional Staff",
      email: "staff@example.test",
      roles: ["PERSONNEL"],
      branchIds: ["33333333-3333-4333-8333-333333333333"]
    };
    const response = await fetch(`${baseUrl}/api/staff-accounts`, {
      method: "POST",
      headers: { Authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    assert.equal(response.status, 201);
    const responseBody = await response.json();
    assert.deepEqual(responseBody, created);
    assert.deepEqual(receivedBody, body);
    assert.deepEqual(receivedActor, {
      userId: "11111111-1111-4111-8111-111111111111",
      authUserId: "22222222-2222-4222-8222-222222222222",
      requestId
    });
    assert.equal("authUserId" in responseBody, false);
    assert.equal("password" in responseBody, false);
    assert.equal("token" in responseBody, false);
    assert.equal("permissions" in responseBody, false);
  });
});
