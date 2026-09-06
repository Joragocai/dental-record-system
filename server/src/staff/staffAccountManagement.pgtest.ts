import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";
import type { ApplicationRoleCode } from "../repositories/applicationUserRepository.js";
import type { PendingStaffAccountRecord, StaffAccountRepository } from "../repositories/staffAccountRepository.js";
import { StaffAccountError } from "../services/staffAccountErrors.js";
import { createStaffAccountManagementService } from "../services/staffAccountManagementService.js";

const staffId = "11111111-1111-4111-8111-111111111111";
const branchA = "22222222-2222-4222-8222-222222222222";
const branchB = "33333333-3333-4333-8333-333333333333";
const personnelRoleId = "44444444-4444-4444-8444-444444444444";
const dentistRoleId = "55555555-5555-4555-8555-555555555555";
const actor = {
  userId: "66666666-6666-4666-8666-666666666666",
  authUserId: "77777777-7777-4777-8777-777777777777"
};

class FakePool implements PgPoolManager {
  transactionCalls = 0;
  rolledBack = 0;
  private readonly executor: PgQueryExecutor = {
    async query<R extends QueryResultRow = QueryResultRow>(): Promise<QueryResult<R>> {
      return { command: "SELECT", rowCount: 0, oid: 0, fields: [], rows: [] };
    }
  };

  describeTarget() {
    return { appEnv: "test" as const, host: "localhost", port: 5432, database: "fake_test", username: "fake", sslMode: "disable" as const };
  }
  isStarted() { return false; }
  async shutdown() {}
  async query<R extends QueryResultRow = QueryResultRow>(): Promise<QueryResult<R>> {
    return { command: "SELECT", rowCount: 0, oid: 0, fields: [], rows: [] };
  }
  async withTransaction<T>(callback: (executor: PgQueryExecutor) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    try {
      return await callback(this.executor);
    } catch (error) {
      this.rolledBack += 1;
      throw error;
    }
  }
}

function buildRepository(options: {
  emailExists?: boolean;
  roleCodes?: ApplicationRoleCode[];
  branchIds?: string[];
  failRoleInsert?: boolean;
} = {}): StaffAccountRepository & { insertedUser: PendingStaffAccountRecord | null; roleAssignments: string[]; branchAssignments: string[] } {
  const roleCodes = options.roleCodes ?? ["PERSONNEL", "DENTIST"];
  const roleMap = new Map<ApplicationRoleCode, string>();
  if (roleCodes.includes("PERSONNEL")) roleMap.set("PERSONNEL", personnelRoleId);
  if (roleCodes.includes("DENTIST")) roleMap.set("DENTIST", dentistRoleId);

  return {
    insertedUser: null,
    roleAssignments: [],
    branchAssignments: [],
    async emailExists() { return options.emailExists ?? false; },
    async resolveRoleIds(requested) {
      return new Map(requested.filter((role) => roleMap.has(role)).map((role) => [role, roleMap.get(role)!]));
    },
    async resolveExistingBranchIds(requested) {
      const known = new Set(options.branchIds ?? [branchA, branchB]);
      return new Set(requested.filter((branchId) => known.has(branchId)));
    },
    async insertPendingUser(record) { this.insertedUser = record; },
    async insertRoleAssignments(_userId, roleIds) {
      if (options.failRoleInsert) throw new Error("secret database detail");
      this.roleAssignments.push(...roleIds);
    },
    async insertBranchAssignments(_userId, branchIds) { this.branchAssignments.push(...branchIds); }
  };
}

function assertStaffError(error: unknown, code: StaffAccountError["code"]): boolean {
  return error instanceof StaffAccountError && error.code === code;
}

test("staff account service normalizes and creates a pending operational staff record atomically", async () => {
  const pool = new FakePool();
  const repository = buildRepository();
  const service = createStaffAccountManagementService(pool, {
    createId: () => staffId,
    createRepository: () => repository
  });

  const created = await service.createPendingStaffAccount({
    displayName: "  Fictional   Dentist  ",
    email: "  STAFF@EXAMPLE.TEST ",
    roles: ["DENTIST", "PERSONNEL"],
    branchIds: [branchB, branchA]
  }, actor);

  assert.deepEqual(created, {
    id: staffId,
    email: "staff@example.test",
    displayName: "Fictional Dentist",
    status: "pending",
    roles: ["DENTIST", "PERSONNEL"],
    branchIds: [branchA, branchB]
  });
  assert.equal(pool.transactionCalls, 1);
  assert.deepEqual(repository.insertedUser, {
    id: staffId,
    email: "staff@example.test",
    displayName: "Fictional Dentist",
    status: "pending"
  });
  assert.deepEqual(repository.roleAssignments, [dentistRoleId, personnelRoleId]);
  assert.deepEqual(repository.branchAssignments, [branchA, branchB]);
  assert.equal("authUserId" in created, false);
  assert.equal("password" in created, false);
  assert.equal("token" in created, false);
});

test("staff account service accepts only Personnel and Dentist roles", async () => {
  const blockedRoles = ["PATIENT", "CLINIC_ADMINISTRATOR", "SYSTEM_ADMINISTRATOR"];
  for (const role of blockedRoles) {
    const pool = new FakePool();
    const service = createStaffAccountManagementService(pool, { createId: () => staffId, createRepository: () => buildRepository() });
    await assert.rejects(
      service.createPendingStaffAccount({ displayName: "Blocked Role", email: `${role.toLowerCase()}@example.test`, roles: [role], branchIds: [branchA] }, actor),
      (error) => assertStaffError(error, "STAFF_ACCOUNT_ROLE_INVALID")
    );
    assert.equal(pool.transactionCalls, 0);
  }
});

test("staff account service rejects empty or duplicate roles and branches before mutation", async () => {
  const cases = [
    { roles: [], branchIds: [branchA], code: "STAFF_ACCOUNT_ROLE_INVALID" as const },
    { roles: ["PERSONNEL", "PERSONNEL"], branchIds: [branchA], code: "STAFF_ACCOUNT_ROLE_INVALID" as const },
    { roles: ["PERSONNEL"], branchIds: [], code: "STAFF_ACCOUNT_BRANCH_INVALID" as const },
    { roles: ["PERSONNEL"], branchIds: [branchA, branchA], code: "STAFF_ACCOUNT_BRANCH_INVALID" as const },
    { roles: ["PERSONNEL"], branchIds: ["not-a-uuid"], code: "STAFF_ACCOUNT_BRANCH_INVALID" as const }
  ];

  for (const item of cases) {
    const pool = new FakePool();
    const service = createStaffAccountManagementService(pool, { createId: () => staffId, createRepository: () => buildRepository() });
    await assert.rejects(
      service.createPendingStaffAccount({ displayName: "Fictional Staff", email: "staff@example.test", roles: item.roles, branchIds: item.branchIds }, actor),
      (error) => assertStaffError(error, item.code)
    );
    assert.equal(pool.transactionCalls, 0);
  }
});

test("staff account service rejects unknown role/branch and duplicate email safely", async () => {
  const scenarios = [
    { repository: buildRepository({ roleCodes: [] }), code: "STAFF_ACCOUNT_ROLE_INVALID" as const },
    { repository: buildRepository({ branchIds: [] }), code: "STAFF_ACCOUNT_BRANCH_INVALID" as const },
    { repository: buildRepository({ emailExists: true }), code: "STAFF_ACCOUNT_EMAIL_CONFLICT" as const }
  ];

  for (const scenario of scenarios) {
    const pool = new FakePool();
    const service = createStaffAccountManagementService(pool, { createId: () => staffId, createRepository: () => scenario.repository });
    await assert.rejects(
      service.createPendingStaffAccount({ displayName: "Fictional Staff", email: "staff@example.test", roles: ["PERSONNEL"], branchIds: [branchA] }, actor),
      (error) => assertStaffError(error, scenario.code)
    );
    assert.equal(pool.rolledBack, 1);
  }
});

test("staff account service sanitizes assignment failure and transaction rolls back", async () => {
  const pool = new FakePool();
  const repository = buildRepository({ failRoleInsert: true });
  const service = createStaffAccountManagementService(pool, { createId: () => staffId, createRepository: () => repository });

  await assert.rejects(
    service.createPendingStaffAccount({ displayName: "Fictional Staff", email: "staff@example.test", roles: ["PERSONNEL"], branchIds: [branchA] }, actor),
    (error) => {
      assert.equal(assertStaffError(error, "STAFF_ACCOUNT_PERSISTENCE_ERROR"), true);
      assert.doesNotMatch((error as Error).message, /secret database detail/i);
      return true;
    }
  );
  assert.equal(pool.rolledBack, 1);
});

test("staff account service rolls back the staff transaction when audit insertion fails", async () => {
  const pool = new FakePool();
  const repository = buildRepository();
  const service = createStaffAccountManagementService(pool, {
    createId: () => staffId,
    createRepository: () => repository,
    createAuditRepository: () => ({
      async insert() {
        throw new Error("audit driver secret detail");
      }
    })
  });

  await assert.rejects(
    service.createPendingStaffAccount(
      { displayName: "Fictional Staff", email: "audit-failure@example.test", roles: ["PERSONNEL"], branchIds: [branchA] },
      actor
    ),
    (error) => {
      assert.equal(assertStaffError(error, "STAFF_ACCOUNT_PERSISTENCE_ERROR"), true);
      assert.doesNotMatch((error as Error).message, /audit driver secret detail/i);
      return true;
    }
  );
  assert.equal(pool.rolledBack, 1);
});
