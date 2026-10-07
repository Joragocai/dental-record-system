import assert from "node:assert/strict";
import test from "node:test";
import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";
import type { AuditEventRepository, AuditEventRecord } from "../repositories/auditEventRepository.js";
import type { StaffProvisioningProvider } from "../staff/supabaseStaffProvisioningProvider.js";
import { createInitialOwnerBootstrapService } from "./initialOwnerBootstrapService.js";
import { InitialOwnerBootstrapError } from "./initialOwnerBootstrapErrors.js";
import type { InitialOwnerBootstrapRepository } from "./initialOwnerBootstrapRepository.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const providerId = "22222222-2222-4222-8222-222222222222";
const branchId = "33333333-3333-4333-8333-333333333333";
const dentistRoleId = "44444444-4444-4444-8444-444444444444";
const adminRoleId = "55555555-5555-4555-8555-555555555555";

function createPool(): PgPoolManager {
  const executor = { async query() { throw new Error("Unexpected direct SQL in unit test."); } } as PgQueryExecutor;
  return {
    ...executor,
    describeTarget() {
      return { appEnv: "test", host: "localhost", port: 5432, database: "test", username: "test", sslMode: "disable" };
    },
    isStarted() { return true; },
    async shutdown() {},
    async withTransaction(callback) { return callback(executor); }
  };
}

function createRepositoryState(overrides: Partial<{ hasAdmin: boolean; emailExists: boolean; branchExists: boolean }> = {}) {
  const state = {
    hasAdmin: overrides.hasAdmin ?? false,
    emailExistsValue: overrides.emailExists ?? false,
    branchExists: overrides.branchExists ?? true,
    lockCalls: 0,
    insertedUser: null as null | Record<string, string>,
    roleAssignments: [] as string[],
    assignedBranch: null as string | null
  };

  const repository: InitialOwnerBootstrapRepository = {
    async acquireBootstrapLock() { state.lockCalls += 1; },
    async hasClinicAdministrator() { return state.hasAdmin; },
    async emailExists() { return state.emailExistsValue; },
    async getBranchById(id) {
      return state.branchExists && id === branchId ? { id: branchId, code: "MAIN", name: "Fictional Main" } : null;
    },
    async listBranches() { return [{ id: branchId, code: "MAIN", name: "Fictional Main" }]; },
    async getPendingInitialOwner() {
      return state.insertedUser
        ? {
            id: ownerId,
            providerUserId: String(state.insertedUser.providerUserId),
            email: String(state.insertedUser.email),
            roles: ["CLINIC_ADMINISTRATOR", "DENTIST"],
            branchIds: state.assignedBranch ? [state.assignedBranch] : [branchId]
          }
        : null;
    },
    async resolveRoleIds() {
      return new Map([
        ["CLINIC_ADMINISTRATOR", adminRoleId],
        ["DENTIST", dentistRoleId]
      ]);
    },
    async insertPendingLinkedOwner(input) { state.insertedUser = { ...input }; },
    async insertRoleAssignments(_userId, roleIds) { state.roleAssignments = [...roleIds]; },
    async insertBranchAssignment(_userId, id) { state.assignedBranch = id; }
  };

  return { state, repository };
}

function createAuditCapture() {
  const events: AuditEventRecord[] = [];
  const repository: AuditEventRepository = {
    async insert(event) { events.push(event); }
  };
  return { events, repository };
}

test("initial owner bootstrap creates one pending linked owner with exact dual roles and actorless audit", async () => {
  const { state, repository } = createRepositoryState();
  const { events, repository: auditRepository } = createAuditCapture();
  let inviteCalls = 0;
  const provider: StaffProvisioningProvider = {
    async inviteUserByEmail(email, redirectTo, applicationUserId) {
      inviteCalls += 1;
      assert.equal(email, "owner@example.test");
      assert.equal(redirectTo, "http://localhost:5173/activate-account");
      assert.equal(applicationUserId, ownerId);
      return { providerUserId: providerId };
    },
    async deleteUser() { return true; }
  };
  let auditSequence = 0;
  const auditIds = [
    "66666666-6666-4666-8666-666666666661",
    "66666666-6666-4666-8666-666666666662"
  ];

  const service = createInitialOwnerBootstrapService(createPool(), provider, {
    inviteRedirectUrl: "http://localhost:5173/activate-account",
    createRepository: () => repository,
    createAuditRepository: () => auditRepository,
    createId: () => ownerId,
    createAuditId: () => auditIds[auditSequence++]
  });

  const result = await service.bootstrap({
    displayName: "  Fictional   Owner  ",
    email: "OWNER@EXAMPLE.TEST",
    branchId
  });

  assert.equal(inviteCalls, 1);
  assert.equal(state.lockCalls, 1);
  assert.deepEqual(state.insertedUser, {
    id: ownerId,
    providerUserId: providerId,
    email: "owner@example.test",
    displayName: "Fictional Owner"
  });
  assert.deepEqual(new Set(state.roleAssignments), new Set([adminRoleId, dentistRoleId]));
  assert.equal(state.assignedBranch, branchId);
  assert.deepEqual(result.roles, ["CLINIC_ADMINISTRATOR", "DENTIST"]);
  assert.equal(result.status, "pending");
  assert.deepEqual(events.map((event) => [event.action, event.outcome, event.actorUserId, event.actorAuthUserId]), [
    ["INITIAL_OWNER_BOOTSTRAPPED", "SUCCESS", null, null],
    ["USER_INVITED", "SUCCESS", null, null]
  ]);
});

test("initial owner bootstrap refuses before provider invite when a Clinic Administrator already exists", async () => {
  const { repository } = createRepositoryState({ hasAdmin: true });
  let inviteCalls = 0;
  const provider: StaffProvisioningProvider = {
    async inviteUserByEmail() { inviteCalls += 1; return { providerUserId: providerId }; },
    async deleteUser() { return true; }
  };
  const service = createInitialOwnerBootstrapService(createPool(), provider, {
    inviteRedirectUrl: "http://localhost:5173/activate-account",
    createRepository: () => repository,
    createId: () => ownerId
  });

  await assert.rejects(
    service.bootstrap({ displayName: "Fictional Owner", email: "owner@example.test", branchId }),
    (error) => error instanceof InitialOwnerBootstrapError && error.code === "INITIAL_OWNER_BOOTSTRAP_ALREADY_COMPLETED"
  );
  assert.equal(inviteCalls, 0);
});

test("initial owner bootstrap refuses email conflicts before provider invite", async () => {
  const { repository } = createRepositoryState({ emailExists: true });
  let inviteCalls = 0;
  const provider: StaffProvisioningProvider = {
    async inviteUserByEmail() { inviteCalls += 1; return { providerUserId: providerId }; },
    async deleteUser() { return true; }
  };
  const service = createInitialOwnerBootstrapService(createPool(), provider, {
    inviteRedirectUrl: "http://localhost:5173/activate-account",
    createRepository: () => repository,
    createId: () => ownerId
  });

  await assert.rejects(
    service.bootstrap({ displayName: "Fictional Owner", email: "owner@example.test", branchId }),
    (error) => error instanceof InitialOwnerBootstrapError && error.code === "INITIAL_OWNER_BOOTSTRAP_EMAIL_CONFLICT"
  );
  assert.equal(inviteCalls, 0);
});

test("initial owner bootstrap cleans up provider user when final database transaction loses the bootstrap race", async () => {
  const { state, repository } = createRepositoryState();
  const originalHasAdmin = repository.hasClinicAdministrator;
  let checks = 0;
  repository.hasClinicAdministrator = async () => {
    checks += 1;
    if (checks === 1) return false;
    return true;
  };
  let deletedProviderId = "";
  const provider: StaffProvisioningProvider = {
    async inviteUserByEmail() { return { providerUserId: providerId }; },
    async deleteUser(id) { deletedProviderId = id; return true; }
  };
  const { repository: auditRepository } = createAuditCapture();
  const service = createInitialOwnerBootstrapService(createPool(), provider, {
    inviteRedirectUrl: "http://localhost:5173/activate-account",
    createRepository: () => repository,
    createAuditRepository: () => auditRepository,
    createId: () => ownerId
  });

  await assert.rejects(
    service.bootstrap({ displayName: "Fictional Owner", email: "owner@example.test", branchId }),
    (error) => error instanceof InitialOwnerBootstrapError && error.code === "INITIAL_OWNER_BOOTSTRAP_ALREADY_COMPLETED"
  );
  assert.equal(state.lockCalls, 1);
  assert.equal(deletedProviderId, providerId);
  repository.hasClinicAdministrator = originalHasAdmin;
});

test("initial owner bootstrap reports reconciliation required when provider cleanup also fails", async () => {
  const { repository } = createRepositoryState();
  let checks = 0;
  repository.hasClinicAdministrator = async () => (++checks === 1 ? false : true);
  const provider: StaffProvisioningProvider = {
    async inviteUserByEmail() { return { providerUserId: providerId }; },
    async deleteUser() { return false; }
  };
  const { repository: auditRepository } = createAuditCapture();
  const service = createInitialOwnerBootstrapService(createPool(), provider, {
    inviteRedirectUrl: "http://localhost:5173/activate-account",
    createRepository: () => repository,
    createAuditRepository: () => auditRepository,
    createId: () => ownerId
  });

  await assert.rejects(
    service.bootstrap({ displayName: "Fictional Owner", email: "owner@example.test", branchId }),
    (error) => error instanceof InitialOwnerBootstrapError && error.code === "INITIAL_OWNER_BOOTSTRAP_RECONCILIATION_REQUIRED"
  );
});
