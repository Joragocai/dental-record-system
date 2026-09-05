import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { AuthenticationError } from "../auth/authErrors.ts";
import { createAuthRouter } from "./auth.js";

async function withServer(authenticationService, callback) {
  const app = express();
  app.use("/api/auth", createAuthRouter(authenticationService));
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
