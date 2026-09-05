import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../postgres/pool.js";
import {
  createApplicationUserRepository,
  type ApplicationRoleCode,
  type ApplicationUserRecord,
  type ApplicationUserRepository
} from "../repositories/applicationUserRepository.js";
import { ApplicationUserError } from "../services/applicationUserErrors.js";
import { createApplicationUserService } from "../services/applicationUserService.js";

const authUserId = "22222222-2222-4222-8222-222222222222";
const appUserId = "33333333-3333-4333-8333-333333333333";
const branchA = "44444444-4444-4444-8444-444444444444";
const branchB = "55555555-5555-4555-8555-555555555555";

function buildUser(overrides: Partial<ApplicationUserRecord> = {}): ApplicationUserRecord {
  return {
    id: appUserId,
    authUserId,
    email: "fictional.staff@example.test",
    displayName: "Fictional Staff",
    status: "active",
    createdAt: "2026-09-05T08:00:00.000Z",
    updatedAt: "2026-09-05T08:00:00.000Z",
    ...overrides
  };
}

function createFakeRepository(options: {
  user?: ApplicationUserRecord | null;
  roles?: ApplicationRoleCode[];
  branches?: string[];
} = {}): ApplicationUserRepository & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async getByAuthUserId() {
      calls.push("getByAuthUserId");
      return options.user === undefined ? buildUser() : options.user;
    },
    async getById() {
      calls.push("getById");
      return options.user === undefined ? buildUser() : options.user;
    },
    async listRoleCodes() {
      calls.push("listRoleCodes");
      return options.roles ?? [];
    },
    async listBranchIds() {
      calls.push("listBranchIds");
      return options.branches ?? [];
    }
  };
}

function assertApplicationUserError(error: unknown, code: ApplicationUserError["code"]): boolean {
  return error instanceof ApplicationUserError && error.code === code;
}

test("ApplicationUserService rejects malformed auth UUID before repository access", async () => {
  const repository = createFakeRepository();
  const service = createApplicationUserService(repository);

  await assert.rejects(service.resolveByAuthUserId("not-a-uuid"), (error) =>
    assertApplicationUserError(error, "INVALID_AUTH_IDENTITY")
  );
  assert.deepEqual(repository.calls, []);
});

test("ApplicationUserService distinguishes missing, pending, and inactive users", async () => {
  await assert.rejects(
    createApplicationUserService(createFakeRepository({ user: null })).resolveByAuthUserId(authUserId),
    (error) => assertApplicationUserError(error, "APPLICATION_USER_NOT_FOUND")
  );
  await assert.rejects(
    createApplicationUserService(createFakeRepository({ user: buildUser({ status: "pending" }) })).resolveByAuthUserId(authUserId),
    (error) => assertApplicationUserError(error, "APPLICATION_USER_PENDING")
  );
  for (const status of ["suspended", "deactivated"] as const) {
    await assert.rejects(
      createApplicationUserService(createFakeRepository({ user: buildUser({ status }) })).resolveByAuthUserId(authUserId),
      (error) => assertApplicationUserError(error, "APPLICATION_USER_INACTIVE")
    );
  }
});

test("ApplicationUserService preserves deterministic multi-role and multi-branch context", async () => {
  const service = createApplicationUserService(
    createFakeRepository({
      roles: ["CLINIC_ADMINISTRATOR", "DENTIST"],
      branches: [branchB, branchA]
    })
  );

  const context = await service.resolveByAuthUserId(authUserId.toUpperCase());
  assert.deepEqual(context.roles, ["CLINIC_ADMINISTRATOR", "DENTIST"]);
  assert.deepEqual(context.branchIds, [branchA, branchB]);
  assert.equal(context.authUserId, authUserId);
});

test("ApplicationUserService permits active users with zero roles for deny-by-default authorization later", async () => {
  const context = await createApplicationUserService(createFakeRepository()).resolveByAuthUserId(authUserId);
  assert.deepEqual(context.roles, []);
  assert.deepEqual(context.branchIds, []);
});

class RecordingExecutor implements PgQueryExecutor {
  readonly queries: Array<{ text: string; values: readonly unknown[] }> = [];

  async query<R extends QueryResultRow = QueryResultRow>(text: string, values: readonly unknown[] = []): Promise<QueryResult<R>> {
    this.queries.push({ text, values });
    const rows: QueryResultRow[] = text.includes("FROM app_users")
      ? [{
          id: appUserId,
          auth_user_id: authUserId,
          email: "fictional.staff@example.test",
          display_name: "Fictional Staff",
          status: "active",
          created_at: "2026-09-05T08:00:00.000Z",
          updated_at: "2026-09-05T08:00:00.000Z"
        }]
      : text.includes("FROM user_roles")
        ? [{ code: "DENTIST" }]
        : text.includes("FROM user_branches")
          ? [{ branch_id: branchA }]
          : [];
    return {
      command: "SELECT",
      rowCount: rows.length,
      oid: 0,
      fields: [],
      rows: rows as R[]
    };
  }
}

test("ApplicationUserRepository uses parameterized identity and membership queries", async () => {
  const executor = new RecordingExecutor();
  const repository = createApplicationUserRepository(executor);

  await repository.getByAuthUserId(authUserId);
  await repository.listRoleCodes(appUserId);
  await repository.listBranchIds(appUserId);

  assert.equal(executor.queries.length, 3);
  for (const query of executor.queries) {
    assert.match(query.text, /\$1/);
    assert.equal(query.values.length, 1);
  }
  assert.deepEqual(executor.queries[0]?.values, [authUserId]);
  assert.deepEqual(executor.queries[1]?.values, [appUserId]);
  assert.deepEqual(executor.queries[2]?.values, [appUserId]);
});

test("ApplicationUserService hides repository/database details behind a safe persistence error", async () => {
  const repository = createFakeRepository();
  repository.getByAuthUserId = async () => {
    throw new Error("postgresql://secret-user:secret-password@db.example/app");
  };

  await assert.rejects(createApplicationUserService(repository).resolveByAuthUserId(authUserId), (error) => {
    assert.equal(assertApplicationUserError(error, "APPLICATION_USER_PERSISTENCE_ERROR"), true);
    assert.doesNotMatch((error as Error).message, /secret-password|postgresql:/i);
    return true;
  });
});
