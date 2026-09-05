import assert from "node:assert/strict";
import test from "node:test";
import { AuthenticationError } from "./authErrors.js";
import { createAuthenticateMiddleware, type AuthenticationResponseLike } from "./authMiddleware.js";
import type { AuthenticationService } from "./authService.js";

function createResponse(): AuthenticationResponseLike & { headers: Map<string, string> } {
  const headers = new Map<string, string>();
  return {
    locals: {},
    headers,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    }
  };
}

test("authentication middleware stores the verified principal in res.locals", async () => {
  const service: AuthenticationService = {
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
  const middleware = createAuthenticateMiddleware(service);
  const res = createResponse();
  const nextCalls: unknown[] = [];

  await middleware({ headers: { authorization: "Bearer valid-token" } }, res, (error) => nextCalls.push(error));

  assert.deepEqual(res.locals.auth, {
    subject: "22222222-2222-4222-8222-222222222222",
    email: "fictional@example.test",
    audience: "authenticated",
    provider: "supabase"
  });
  assert.deepEqual(nextCalls, [undefined]);
  assert.equal(res.headers.size, 0);
});

test("authentication middleware forwards safe 401 errors and sets WWW-Authenticate", async () => {
  const service: AuthenticationService = {
    async authenticateAuthorizationHeader() {
      throw new AuthenticationError("TOKEN_INVALID");
    }
  };
  const middleware = createAuthenticateMiddleware(service);
  const res = createResponse();
  const nextCalls: unknown[] = [];

  await middleware({ headers: { authorization: "Bearer hidden-token" } }, res, (error) => nextCalls.push(error));

  assert.equal(res.locals.auth, undefined);
  assert.equal(res.headers.get("www-authenticate"), "Bearer");
  assert.equal(nextCalls.length, 1);
  assert.ok(nextCalls[0] instanceof AuthenticationError);
  assert.equal((nextCalls[0] as AuthenticationError).code, "TOKEN_INVALID");
  assert.doesNotMatch((nextCalls[0] as Error).message, /hidden-token/);
});

test("authentication middleware preserves safe provider status and does not set challenge for 503", async () => {
  const service: AuthenticationService = {
    async authenticateAuthorizationHeader() {
      throw new Error("provider detail with bearer secret");
    }
  };
  const middleware = createAuthenticateMiddleware(service);
  const res = createResponse();
  const nextCalls: unknown[] = [];

  await middleware({ headers: { authorization: "Bearer another-secret" } }, res, (error) => nextCalls.push(error));

  assert.equal(res.headers.has("www-authenticate"), false);
  assert.equal(nextCalls.length, 1);
  assert.ok(nextCalls[0] instanceof AuthenticationError);
  assert.equal((nextCalls[0] as AuthenticationError).code, "PROVIDER_UNAVAILABLE");
  assert.equal((nextCalls[0] as AuthenticationError).status, 503);
  assert.doesNotMatch((nextCalls[0] as Error).message, /secret|bearer/i);
});
