import assert from "node:assert/strict";
import test from "node:test";
import type { AccessRuntimeServices } from "./accessRuntime.js";
import { createAccessBoundary, type AccessResponseLike } from "./accessMiddleware.js";
import { ApplicationUserError } from "../services/applicationUserErrors.js";
import { AuthorizationError } from "../services/authorizationErrors.js";
import type { ApplicationUserContext } from "../services/applicationUserService.js";
import type { AuthorizationContext } from "../services/authorizationService.js";

const authUserId = "22222222-2222-4222-8222-222222222222";
const appUserId = "33333333-3333-4333-8333-333333333333";
const branchA = "44444444-4444-4444-8444-444444444444";
const requestId = "55555555-5555-4555-8555-555555555555";

function buildApplicationUser(): ApplicationUserContext {
  return {
    userId: appUserId,
    authUserId,
    email: "fictional@example.test",
    displayName: "Fictional User",
    status: "active",
    roles: ["CLINIC_ADMINISTRATOR"],
    branchIds: [branchA]
  };
}

function buildAuthorization(): AuthorizationContext {
  return {
    ...buildApplicationUser(),
    permissions: [{ code: "user.read", scope: "GLOBAL" }, { code: "patient.read", scope: "BRANCH" }]
  };
}

function createHarness(overrides: Partial<AccessRuntimeServices> = {}) {
  const calls: string[] = [];
  const applicationUserService = overrides.applicationUserService ?? {
    async resolveByAuthUserId(subject: string) {
      calls.push(`application:${subject}`);
      return buildApplicationUser();
    }
  };
  const authorizationService = overrides.authorizationService ?? {
    async resolveContext() {
      calls.push("authorization:resolve");
      return buildAuthorization();
    },
    requirePermission(_context: AuthorizationContext, permission: string) {
      calls.push(`permission:${permission}`);
    },
    requireAnyBranchPermission(_context: AuthorizationContext, permission: string) {
      calls.push(`any-branch:${permission}`);
    },
    requireBranchPermission(_context: AuthorizationContext, permission: string, branchId: string) {
      calls.push(`branch:${permission}:${branchId}`);
    }
  };
  const boundary = createAccessBoundary({
    getServices: () => ({
      applicationUserService,
      authorizationService,
      auditEventService: overrides.auditEventService
    } as AccessRuntimeServices)
  });
  const res: AccessResponseLike = {
    locals: {
      auth: {
        subject: authUserId,
        email: "fictional@example.test",
        audience: "authenticated",
        provider: "supabase" as const
      },
      requestId
    }
  };
  return { boundary, res, calls };
}

async function runAsyncMiddleware(middleware: Function, req: object, res: object): Promise<unknown> {
  return new Promise((resolve) => middleware(req, res, (error?: unknown) => resolve(error)));
}

test("access middleware resolves application user then authorization context before permission evaluation", async () => {
  const { boundary, res, calls } = createHarness();

  assert.equal(await runAsyncMiddleware(boundary.resolveApplicationUser, {}, res), undefined);
  assert.equal(await runAsyncMiddleware(boundary.resolveAuthorization, {}, res), undefined);
  assert.equal(await runAsyncMiddleware(boundary.requirePermission("user.read"), {}, res), undefined);

  assert.deepEqual(calls, [
    `application:${authUserId}`,
    "authorization:resolve",
    "permission:user.read"
  ]);
  assert.equal(res.locals.applicationUser?.userId, appUserId);
  assert.equal(res.locals.authorization?.userId, appUserId);
});

test("unlinked, pending, and inactive application users are translated to the same safe 403", async () => {
  for (const code of ["APPLICATION_USER_NOT_FOUND", "APPLICATION_USER_PENDING", "APPLICATION_USER_INACTIVE"] as const) {
    const applicationUserService = {
      async resolveByAuthUserId() {
        throw new ApplicationUserError(code);
      }
    };
    const { boundary, res } = createHarness({ applicationUserService });
    const error = await runAsyncMiddleware(boundary.resolveApplicationUser, {}, res) as Error & { status?: number };

    assert.equal(error.status, 403);
    assert.equal(error.message, "You are not authorized to access this resource.");
  }
});

test("application-user persistence failure is translated to safe 503 without details", async () => {
  const applicationUserService = {
    async resolveByAuthUserId() {
      throw new Error("postgresql://secret:password@example/db");
    }
  };
  const { boundary, res } = createHarness({ applicationUserService });
  const error = await runAsyncMiddleware(boundary.resolveApplicationUser, {}, res) as Error & { status?: number };

  assert.equal(error.status, 503);
  assert.doesNotMatch(error.message, /secret|postgresql|password/i);
});

test("global permission middleware does not require branch input", async () => {
  const { boundary, res, calls } = createHarness();
  await runAsyncMiddleware(boundary.resolveApplicationUser, {}, res);
  await runAsyncMiddleware(boundary.resolveAuthorization, {}, res);
  const error = await runAsyncMiddleware(boundary.requirePermission("user.read"), {}, res);

  assert.equal(error, undefined);
  assert.equal(calls.includes("permission:user.read"), true);
});

test("any-branch middleware delegates branch-scoped permission without browser branch input", async () => {
  const { boundary, res, calls } = createHarness();
  await runAsyncMiddleware(boundary.resolveApplicationUser, {}, res);
  await runAsyncMiddleware(boundary.resolveAuthorization, {}, res);
  const error = await runAsyncMiddleware(boundary.requireAnyBranchPermission("patient.read"), {}, res);

  assert.equal(error, undefined);
  assert.equal(calls.includes("any-branch:patient.read"), true);
});

test("branch middleware delegates the extracted target branch", async () => {
  const { boundary, res, calls } = createHarness();
  await runAsyncMiddleware(boundary.resolveApplicationUser, {}, res);
  await runAsyncMiddleware(boundary.resolveAuthorization, {}, res);
  const middleware = boundary.requireBranchPermission("patient.read", (req) => String(req.params?.branchId ?? ""));
  const error = await runAsyncMiddleware(middleware, { params: { branchId: branchA } }, res);

  assert.equal(error, undefined);
  assert.equal(calls.includes(`branch:patient.read:${branchA}`), true);
});

test("authorization denial audit is best-effort and preserves the original 403", async () => {
  const denialEvents: Array<Record<string, unknown>> = [];
  const authorizationService = {
    async resolveContext() {
      return buildAuthorization();
    },
    requirePermission() {
      throw new AuthorizationError("AUTHORIZATION_DENIED");
    },
    requireAnyBranchPermission() {
      throw new AuthorizationError("AUTHORIZATION_DENIED");
    },
    requireBranchPermission() {
      throw new AuthorizationError("AUTHORIZATION_DENIED");
    }
  };
  const auditEventService = {
    async recordAuthorizationDenied(input: Record<string, unknown>) {
      denialEvents.push(input);
      throw new Error("audit write unavailable");
    }
  } as unknown as AccessRuntimeServices["auditEventService"];

  const { boundary, res } = createHarness({ authorizationService, auditEventService });
  await runAsyncMiddleware(boundary.resolveApplicationUser, {}, res);
  await runAsyncMiddleware(boundary.resolveAuthorization, {}, res);

  const denied = await runAsyncMiddleware(boundary.requirePermission("user.read"), {}, res) as AuthorizationError;
  assert.equal(denied.code, "AUTHORIZATION_DENIED");
  assert.equal(denied.status, 403);

  const branchDenied = await runAsyncMiddleware(
    boundary.requireBranchPermission("patient.read", () => branchA),
    { params: { branchId: branchA } },
    res
  ) as AuthorizationError;
  assert.equal(branchDenied.status, 403);
  assert.deepEqual(denialEvents, [
    {
      actorUserId: appUserId,
      actorAuthUserId: authUserId,
      requestId,
      permission: "user.read",
      branchId: null
    },
    {
      actorUserId: appUserId,
      actorAuthUserId: authUserId,
      requestId,
      permission: "patient.read",
      branchId: branchA
    }
  ]);
});

test("authorization denial is forwarded as safe 403", async () => {
  const authorizationService = {
    async resolveContext() {
      return buildAuthorization();
    },
    requirePermission() {
      throw new AuthorizationError("AUTHORIZATION_DENIED");
    },
    requireAnyBranchPermission() {
      throw new AuthorizationError("AUTHORIZATION_DENIED");
    },
    requireBranchPermission() {
      throw new AuthorizationError("AUTHORIZATION_BRANCH_INVALID");
    }
  };
  const { boundary, res } = createHarness({ authorizationService });
  await runAsyncMiddleware(boundary.resolveApplicationUser, {}, res);
  await runAsyncMiddleware(boundary.resolveAuthorization, {}, res);

  const denied = await runAsyncMiddleware(boundary.requirePermission("user.read"), {}, res) as AuthorizationError;
  assert.equal(denied.status, 403);

  const invalidBranch = await runAsyncMiddleware(
    boundary.requireBranchPermission("patient.read", () => "not-a-uuid"),
    {},
    res
  ) as AuthorizationError;
  assert.equal(invalidBranch.status, 400);
});
