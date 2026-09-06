import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { PgPoolManager, PgQueryExecutor } from "../postgres/pool.js";
import type {
  StaffProvisioningRepository,
  StaffProvisioningTarget
} from "../repositories/staffProvisioningRepository.js";
import { StaffProvisioningError } from "../services/staffProvisioningErrors.js";
import { createStaffProvisioningService } from "../services/staffProvisioningService.js";
import { buildStaffProvisioningConfig } from "./staffProvisioningConfig.js";
import {
  createSupabaseStaffProvisioningProvider,
  type StaffProvisioningProvider
} from "./supabaseStaffProvisioningProvider.js";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const actorAuthUserId = "22222222-2222-4222-8222-222222222222";
const targetUserId = "33333333-3333-4333-8333-333333333333";
const providerUserId = "44444444-4444-4444-8444-444444444444";
const branchId = "55555555-5555-4555-8555-555555555555";

class FakePool implements PgPoolManager {
  transactionCalls = 0;
  auditInserts = 0;
  async query<R extends QueryResultRow = QueryResultRow>(): Promise<QueryResult<R>> {
    return { command: "SELECT", rowCount: 0, oid: 0, fields: [], rows: [] };
  }
  describeTarget() {
    return { appEnv: "test" as const, host: "localhost", port: 5432, database: "fake_test", username: "fake", sslMode: "disable" as const };
  }
  isStarted() { return false; }
  async shutdown() {}
  async withTransaction<T>(callback: (executor: PgQueryExecutor) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    const executor: PgQueryExecutor = {
      query: async <R extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<R>> => {
        if (text.includes("INSERT INTO audit_events")) this.auditInserts += 1;
        return { command: "INSERT", rowCount: 1, oid: 0, fields: [], rows: [] } as QueryResult<R>;
      }
    };
    return callback(executor);
  }
}

function target(overrides: Partial<StaffProvisioningTarget> = {}): StaffProvisioningTarget {
  return {
    id: targetUserId,
    authUserId: null,
    email: "staff@example.test",
    displayName: "Fictional Staff",
    status: "pending",
    roles: ["PERSONNEL"],
    branchIds: [branchId],
    ...overrides
  };
}

function repository(initial: StaffProvisioningTarget | null, options: { link?: boolean; activate?: boolean } = {}): StaffProvisioningRepository {
  return {
    async getById() { return initial; },
    async getByAuthUserId() { return initial; },
    async linkProviderUser() { return options.link ?? true; },
    async activateLinkedUser() { return options.activate ?? true; }
  };
}

function assertProvisioningError(error: unknown, code: StaffProvisioningError["code"]): boolean {
  return error instanceof StaffProvisioningError && error.code === code;
}

test("staff provisioning config requires a server-only secret and validated URLs", () => {
  const config = buildStaffProvisioningConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_example",
    STAFF_INVITE_REDIRECT_URL: "http://localhost:5173/activate-account"
  });
  assert.equal(config.secretKey, "sb_secret_example");
  assert.equal(config.inviteRedirectUrl, "http://localhost:5173/activate-account");
  assert.throws(() => buildStaffProvisioningConfig({
    SUPABASE_URL: "https://example.supabase.co",
    STAFF_INVITE_REDIRECT_URL: "http://localhost:5173/activate-account"
  }), /SUPABASE_SECRET_KEY/);
});

test("Supabase provider sends invite with secret only in server headers and safe metadata", async () => {
  let capturedUrl = "";
  let capturedHeaders = new Headers();
  let capturedBody = "";
  const provider = createSupabaseStaffProvisioningProvider({
    supabaseUrl: "https://example.supabase.co",
    secretKey: "sb_secret_do_not_expose",
    requestTimeoutMs: 1000,
    inviteRedirectUrl: "http://localhost:5173/activate-account"
  }, async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    capturedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ id: providerUserId }), { status: 200, headers: { "content-type": "application/json" } });
  });

  const result = await provider.inviteUserByEmail("staff@example.test", "http://localhost:5173/activate-account", targetUserId);
  assert.equal(result.providerUserId, providerUserId);
  assert.match(capturedUrl, /auth\/v1\/invite\?redirect_to=/);
  assert.equal(capturedHeaders.get("apikey"), "sb_secret_do_not_expose");
  assert.equal(capturedHeaders.get("authorization"), "Bearer sb_secret_do_not_expose");
  assert.match(capturedBody, /application_user_id/);
  assert.doesNotMatch(capturedBody, /sb_secret_do_not_expose/);
});

test("already-linked pending staff is idempotent and does not resend provider invite", async () => {
  const pool = new FakePool();
  let invites = 0;
  const provider: StaffProvisioningProvider = {
    async inviteUserByEmail() { invites += 1; return { providerUserId }; },
    async deleteUser() { return true; }
  };
  const service = createStaffProvisioningService(pool, provider, {
    inviteRedirectUrl: "http://localhost:5173/activate-account",
    createRepository: () => repository(target({ authUserId: providerUserId }))
  });

  const result = await service.invitePendingStaff({ targetUserId, actorUserId, actorAuthUserId });
  assert.deepEqual(result, { id: targetUserId, status: "pending", invitation: "already_sent" });
  assert.equal(invites, 0);
});

test("successful invite links provider identity and records append-only invite audit", async () => {
  const pool = new FakePool();
  const provider: StaffProvisioningProvider = {
    async inviteUserByEmail() { return { providerUserId }; },
    async deleteUser() { return true; }
  };
  const service = createStaffProvisioningService(pool, provider, {
    inviteRedirectUrl: "http://localhost:5173/activate-account",
    createRepository: () => repository(target())
  });

  const result = await service.invitePendingStaff({ targetUserId, actorUserId, actorAuthUserId });
  assert.equal(result.invitation, "sent");
  assert.equal(pool.auditInserts, 1);
});

test("provider user is cleaned up when database linkage fails", async () => {
  const pool = new FakePool();
  let deleted = "";
  const provider: StaffProvisioningProvider = {
    async inviteUserByEmail() { return { providerUserId }; },
    async deleteUser(id) { deleted = id; return true; }
  };
  const service = createStaffProvisioningService(pool, provider, {
    inviteRedirectUrl: "http://localhost:5173/activate-account",
    createRepository: () => repository(target(), { link: false })
  });

  await assert.rejects(
    service.invitePendingStaff({ targetUserId, actorUserId, actorAuthUserId }),
    (error) => assertProvisioningError(error, "STAFF_PROVISIONING_TARGET_NOT_PENDING")
  );
  assert.equal(deleted, providerUserId);
});

test("cleanup failure returns reconciliation-required instead of guessing provider ownership", async () => {
  const pool = new FakePool();
  const provider: StaffProvisioningProvider = {
    async inviteUserByEmail() { return { providerUserId }; },
    async deleteUser() { return false; }
  };
  const service = createStaffProvisioningService(pool, provider, {
    inviteRedirectUrl: "http://localhost:5173/activate-account",
    createRepository: () => repository(target(), { link: false })
  });

  await assert.rejects(
    service.invitePendingStaff({ targetUserId, actorUserId, actorAuthUserId }),
    (error) => assertProvisioningError(error, "STAFF_PROVISIONING_RECONCILIATION_REQUIRED")
  );
});

test("activation requires matching email and records activation audit atomically", async () => {
  const pool = new FakePool();
  const linked = target({ authUserId: providerUserId });
  const provider: StaffProvisioningProvider = {
    async inviteUserByEmail() { throw new Error("not used"); },
    async deleteUser() { return true; }
  };
  const service = createStaffProvisioningService(pool, provider, {
    inviteRedirectUrl: "http://localhost:5173/activate-account",
    createRepository: () => repository(linked)
  });

  await assert.rejects(
    service.activateInvitedStaff({ authUserId: providerUserId, email: "other@example.test" }),
    (error) => assertProvisioningError(error, "STAFF_PROVISIONING_EMAIL_MISMATCH")
  );

  const result = await service.activateInvitedStaff({ authUserId: providerUserId, email: "STAFF@example.test" });
  assert.deepEqual(result, { activated: true });
  assert.equal(pool.auditInserts, 1);
});
