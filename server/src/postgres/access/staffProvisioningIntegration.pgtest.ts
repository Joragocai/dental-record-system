import assert from "node:assert/strict";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "../config.js";
import { migrationTableName, runPendingMigrations } from "../migrations.js";
import { createPgPoolManager } from "../pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "../testSafety.js";
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

test("Phase 08I PostgreSQL staff provisioning links invite identity, is idempotent, and activates with audit", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  const adminUserId = "11111111-1111-4111-8111-111111111111";
  const adminAuthId = "22222222-2222-4222-8222-222222222222";
  const targetUserId = "33333333-3333-4333-8333-333333333333";
  const providerUserId = "44444444-4444-4444-8444-444444444444";
  const branchId = "55555555-5555-4555-8555-555555555555";
  let inviteCalls = 0;

  const provider: StaffProvisioningProvider = {
    async inviteUserByEmail(email, redirectTo, applicationUserId) {
      inviteCalls += 1;
      assert.equal(email, "staff@example.test");
      assert.equal(redirectTo, "http://localhost:5173/activate-account");
      assert.equal(applicationUserId, targetUserId);
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
    await pool.query(
      `INSERT INTO app_users (id, auth_user_id, email, display_name, status, created_at, updated_at)
       VALUES ($1, $2, 'admin@example.test', 'Fictional Admin', 'active', NOW(), NOW()),
              ($3, NULL, 'staff@example.test', 'Fictional Staff', 'pending', NOW(), NOW())`,
      [adminUserId, adminAuthId, targetUserId]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_at)
       SELECT $1, id, NOW() FROM roles WHERE code = 'CLINIC_ADMINISTRATOR'`,
      [adminUserId]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_at)
       SELECT $1, id, NOW() FROM roles WHERE code = 'PERSONNEL'`,
      [targetUserId]
    );
    await pool.query(
      `INSERT INTO user_branches (user_id, branch_id, assigned_at) VALUES ($1, $2, NOW())`,
      [targetUserId, branchId]
    );

    const service = createStaffProvisioningService(pool, provider, {
      inviteRedirectUrl: "http://localhost:5173/activate-account"
    });

    const invited = await service.invitePendingStaff({ targetUserId, actorUserId: adminUserId, actorAuthUserId: adminAuthId });
    assert.deepEqual(invited, { id: targetUserId, status: "pending", invitation: "sent" });

    const invitedAgain = await service.invitePendingStaff({ targetUserId, actorUserId: adminUserId, actorAuthUserId: adminAuthId });
    assert.equal(invitedAgain.invitation, "already_sent");
    assert.equal(inviteCalls, 1);

    const linked = await pool.query<{ auth_user_id: string | null; status: string }>(
      "SELECT auth_user_id, status FROM app_users WHERE id = $1",
      [targetUserId]
    );
    assert.deepEqual(linked.rows, [{ auth_user_id: providerUserId, status: "pending" }]);

    const activated = await service.activateInvitedStaff({ authUserId: providerUserId, email: "STAFF@EXAMPLE.TEST" });
    assert.deepEqual(activated, { activated: true });

    const active = await pool.query<{ status: string }>("SELECT status FROM app_users WHERE id = $1", [targetUserId]);
    assert.deepEqual(active.rows, [{ status: "active" }]);

    const audits = await pool.query<{ action: string; outcome: string }>(
      `SELECT action, outcome
       FROM audit_events
       WHERE target_id = $1 AND action IN ('USER_INVITED', 'USER_ACTIVATED')
       ORDER BY occurred_at ASC`,
      [targetUserId]
    );
    assert.deepEqual(audits.rows, [
      { action: "USER_INVITED", outcome: "SUCCESS" },
      { action: "USER_ACTIVATED", outcome: "SUCCESS" }
    ]);
  } finally {
    await resetKnownTables(pool);
    await pool.shutdown();
  }
});
