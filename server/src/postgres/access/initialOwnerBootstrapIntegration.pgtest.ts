import assert from "node:assert/strict";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "../config.js";
import { migrationTableName, runPendingMigrations } from "../migrations.js";
import { createPgPoolManager } from "../pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "../testSafety.js";
import { createInitialOwnerBootstrapService } from "../../bootstrap/initialOwnerBootstrapService.js";
import { InitialOwnerBootstrapError } from "../../bootstrap/initialOwnerBootstrapErrors.js";
import { createStaffProvisioningService } from "../../services/staffProvisioningService.js";
import type { StaffProvisioningProvider } from "../../staff/supabaseStaffProvisioningProvider.js";

function buildTestDatabaseConfig() {
  const config = buildPgFoundationConfig(process.env);
  if (!config.testDatabaseUrl) throw new Error("TEST_DATABASE_URL is not configured.");
  assertSafeTestDatabaseTarget(config.testDatabaseUrl, config.databaseUrl, config.appEnv);
  const summary = summarizeDatabaseUrl(config.testDatabaseUrl, config.sslMode, config.appEnv);
  return { ...config, ...summary, databaseUrl: config.testDatabaseUrl };
}

const resetTables = [
  "audit_events",
  "attachments",
  "role_permissions",
  "permissions",
  "user_branches",
  "user_roles",
  "app_users",
  "roles",
  "legacy_appointment_identity_map",
  "appointments",
  "legacy_treatment_identity_map",
  "treatments",
  "treatment_code_counters",
  "legacy_patient_identity_map",
  "patients",
  "patient_code_counters",
  "branches",
  "drs_v2_foundation_probe",
  migrationTableName
] as const;

async function resetKnownTables(pool: ReturnType<typeof createPgPoolManager>): Promise<void> {
  for (const tableName of resetTables) await pool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
}

test("Phase 08J initial owner bootstrap creates exactly one dual-role pending owner, then existing activation makes it active", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  const branchId = "71111111-1111-4111-8111-111111111111";
  const ownerId = "72222222-2222-4222-8222-222222222222";
  const providerUserId = "73333333-3333-4333-8333-333333333333";
  let inviteCalls = 0;

  const provider: StaffProvisioningProvider = {
    async inviteUserByEmail(email, redirectTo, applicationUserId) {
      inviteCalls += 1;
      assert.equal(email, "owner@example.test");
      assert.equal(redirectTo, "http://localhost:5173/activate-account");
      assert.equal(applicationUserId, ownerId);
      return { providerUserId };
    },
    async deleteUser() { return true; }
  };

  try {
    await resetKnownTables(pool);
    await runPendingMigrations(pool);
    await pool.query(
      `INSERT INTO branches (id, branch_code, branch_name, created_at, updated_at)
       VALUES ($1, 'MAIN', 'Fictional Main Branch', NOW(), NOW())`,
      [branchId]
    );

    const bootstrap = createInitialOwnerBootstrapService(pool, provider, {
      inviteRedirectUrl: "http://localhost:5173/activate-account",
      createId: () => ownerId
    });

    const result = await bootstrap.bootstrap({
      displayName: "Fictional Owner Dentist",
      email: "OWNER@EXAMPLE.TEST",
      branchId
    });
    assert.deepEqual(result, {
      id: ownerId,
      displayName: "Fictional Owner Dentist",
      email: "owner@example.test",
      branchId,
      status: "pending",
      roles: ["CLINIC_ADMINISTRATOR", "DENTIST"],
      invitation: "sent"
    });
    assert.equal(inviteCalls, 1);

    const owner = await pool.query<{ auth_user_id: string | null; status: string }>(
      "SELECT auth_user_id, status FROM app_users WHERE id = $1",
      [ownerId]
    );
    assert.deepEqual(owner.rows, [{ auth_user_id: providerUserId, status: "pending" }]);

    const roles = await pool.query<{ code: string }>(
      `SELECT r.code
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1
       ORDER BY r.code ASC`,
      [ownerId]
    );
    assert.deepEqual(roles.rows, [
      { code: "CLINIC_ADMINISTRATOR" },
      { code: "DENTIST" }
    ]);

    const branches = await pool.query<{ branch_id: string }>(
      "SELECT branch_id FROM user_branches WHERE user_id = $1",
      [ownerId]
    );
    assert.deepEqual(branches.rows, [{ branch_id: branchId }]);

    const auditBeforeActivation = await pool.query<{ action: string; outcome: string; actor_user_id: string | null }>(
      `SELECT action, outcome, actor_user_id
       FROM audit_events
       WHERE target_id = $1
       ORDER BY occurred_at ASC`,
      [ownerId]
    );
    assert.deepEqual(auditBeforeActivation.rows.map((row) => [row.action, row.outcome, row.actor_user_id]), [
      ["INITIAL_OWNER_BOOTSTRAPPED", "SUCCESS", null],
      ["USER_INVITED", "SUCCESS", null]
    ]);

    await assert.rejects(
      bootstrap.bootstrap({ displayName: "Another Owner", email: "another@example.test", branchId }),
      (error) => error instanceof InitialOwnerBootstrapError && error.code === "INITIAL_OWNER_BOOTSTRAP_ALREADY_COMPLETED"
    );
    assert.equal(inviteCalls, 1);

    const provisioning = createStaffProvisioningService(pool, provider, {
      inviteRedirectUrl: "http://localhost:5173/activate-account"
    });
    const activated = await provisioning.activateInvitedStaff({
      authUserId: providerUserId,
      email: "OWNER@EXAMPLE.TEST"
    });
    assert.deepEqual(activated, { activated: true });

    const active = await pool.query<{ status: string }>("SELECT status FROM app_users WHERE id = $1", [ownerId]);
    assert.deepEqual(active.rows, [{ status: "active" }]);

    const activationAudit = await pool.query<{ action: string; outcome: string }>(
      `SELECT action, outcome FROM audit_events
       WHERE target_id = $1 AND action = 'USER_ACTIVATED'`,
      [ownerId]
    );
    assert.deepEqual(activationAudit.rows, [{ action: "USER_ACTIVATED", outcome: "SUCCESS" }]);
  } finally {
    await resetKnownTables(pool);
    await pool.shutdown();
  }
});
