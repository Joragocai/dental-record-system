import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { AuthenticationError } from "../auth/authErrors.ts";
import { createAuthRouter } from "./auth.js";

async function withServer(authenticationService, callback, accessBoundary) {
  const app = express();
  app.use("/api/auth", createAuthRouter(authenticationService, accessBoundary));
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

test("GET /api/auth/session returns only the minimal authenticated identity", async () => {
  const service = {
    async authenticateAuthorizationHeader(header) {
      assert.equal(header, "Bearer valid-token");
      return {
        subject: "22222222-2222-4222-8222-222222222222",
        email: "fictional@example.test",
        audience: "authenticated",
        provider: "supabase"
      };
    }
  };

  await withServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: "Bearer valid-token" }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      authenticated: true,
      user: {
        id: "22222222-2222-4222-8222-222222222222",
        email: "fictional@example.test"
      }
    });
  });
});

test("GET /api/auth/session rejects missing credentials before the handler executes", async () => {
  let serviceCalls = 0;
  const service = {
    async authenticateAuthorizationHeader() {
      serviceCalls += 1;
      throw new AuthenticationError("CREDENTIALS_MISSING");
    }
  };

  await withServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
    assert.deepEqual(await response.json(), { message: "Authentication is required." });
  });
  assert.equal(serviceCalls, 1);
});

test("GET /api/auth/session preserves safe provider-unavailable responses without leaking details", async () => {
  const service = {
    async authenticateAuthorizationHeader() {
      throw new Error("provider failed with secret-token-value");
    }
  };

  await withServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: "Bearer secret-token-value" }
    });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.deepEqual(body, { message: "Authentication service is temporarily unavailable." });
    assert.doesNotMatch(JSON.stringify(body), /secret-token-value/);
  });
});

function createFakeAccessBoundary(options = {}) {
  const calls = [];
  return {
    calls,
    async resolveApplicationUser(_req, res, next) {
      calls.push("application-user");
      if (options.applicationUserError) {
        next(options.applicationUserError);
        return;
      }
      res.locals.applicationUser = { userId: "33333333-3333-4333-8333-333333333333" };
      next();
    },
    async resolveAuthorization(_req, res, next) {
      calls.push("authorization-context");
      if (options.authorizationError) {
        next(options.authorizationError);
        return;
      }
      res.locals.authorization = { userId: "33333333-3333-4333-8333-333333333333" };
      next();
    },
    requirePermission(permission) {
      return (_req, _res, next) => {
        calls.push(`permission:${permission}`);
        if (options.permissionError) {
          next(options.permissionError);
          return;
        }
        next();
      };
    },
    requireBranchPermission() {
      return (_req, _res, next) => next();
    }
  };
}

test("GET /api/auth/access runs authenticated RBAC middleware and returns only authorized true", async () => {
  const service = {
    async authenticateAuthorizationHeader(header) {
      assert.equal(header, "Bearer valid-token");
      return {
        subject: "22222222-2222-4222-8222-222222222222",
        email: "fictional@example.test",
        audience: "authenticated",
        provider: "supabase"
      };
    }
  };
  const accessBoundary = createFakeAccessBoundary();

  await withServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/access`, {
      headers: { Authorization: "Bearer valid-token" }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authorized: true });
  }, accessBoundary);

  assert.deepEqual(accessBoundary.calls, [
    "application-user",
    "authorization-context",
    "permission:user.read"
  ]);
});

test("GET /api/auth/access rejects missing credentials before RBAC middleware", async () => {
  const service = {
    async authenticateAuthorizationHeader() {
      throw new AuthenticationError("CREDENTIALS_MISSING");
    }
  };
  const accessBoundary = createFakeAccessBoundary();

  await withServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/access`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
    assert.deepEqual(await response.json(), { message: "Authentication is required." });
  }, accessBoundary);

  assert.deepEqual(accessBoundary.calls, []);
});

test("GET /api/auth/access returns safe 403 and never runs the handler when permission is denied", async () => {
  const service = {
    async authenticateAuthorizationHeader() {
      return {
        subject: "22222222-2222-4222-8222-222222222222",
        email: "fictional@example.test",
        audience: "authenticated",
        provider: "supabase"
      };
    }
  };
  const denied = Object.assign(new Error("You are not authorized to perform this action."), { status: 403 });
  const accessBoundary = createFakeAccessBoundary({ permissionError: denied });

  await withServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/access`, {
      headers: { Authorization: "Bearer valid-token" }
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { message: "You are not authorized to perform this action." });
  }, accessBoundary);
});
