import assert from "node:assert/strict";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "../config.js";
import { migrationTableName, runPendingMigrations } from "../migrations.js";
import { createPgPoolManager } from "../pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "../testSafety.js";
import { StaffAccountError } from "../../services/staffAccountErrors.js";
import { createStaffAccountManagementService } from "../../services/staffAccountManagementService.js";

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
  "appointment_history",
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
  await pool.query("DROP FUNCTION IF EXISTS reject_audit_event_mutation() CASCADE");
}

function assertStaffPersistenceError(error: unknown): boolean {
  return error instanceof StaffAccountError && error.code === "STAFF_ACCOUNT_PERSISTENCE_ERROR";
}

test("Phase 08H PostgreSQL audit foundation is append-only and records staff creation atomically", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownTables(pool);

  const branchId = "11111111-1111-4111-8111-111111111111";
  const actorUserId = "22222222-2222-4222-8222-222222222222";
  const actorAuthUserId = "33333333-3333-4333-8333-333333333333";
  const staffId = "44444444-4444-4444-8444-444444444444";
  const auditId = "55555555-5555-4555-8555-555555555555";
  const rollbackStaffId = "66666666-6666-4666-8666-666666666666";

  try {
    await runPendingMigrations(pool);
    await pool.query(
      `INSERT INTO branches (id, branch_code, branch_name, created_at, updated_at)
       VALUES ($1, 'MAIN', 'Main Fictional Branch', NOW(), NOW())`,
      [branchId]
    );
    await pool.query(
      `INSERT INTO app_users (id, auth_user_id, email, display_name, status, created_at, updated_at)
       VALUES ($1, $2, 'audit.admin@example.test', 'Fictional Audit Admin', 'active', NOW(), NOW())`,
      [actorUserId, actorAuthUserId]
    );

    const service = createStaffAccountManagementService(pool, {
      createId: () => staffId,
      createAuditId: () => auditId,
      now: () => new Date("2026-09-06T07:00:00.000Z")
    });
    await service.createPendingStaffAccount({
      displayName: "Fictional Personnel",
      email: "audit.staff@example.test",
      roles: ["PERSONNEL"],
      branchIds: [branchId]
    }, { userId: actorUserId, authUserId: actorAuthUserId });

    const audit = await pool.query<{
      id: string;
      actor_user_id: string;
      actor_auth_user_id: string;
      action: string;
      target_type: string;
      target_id: string;
      branch_id: string | null;
      outcome: string;
      metadata: { roles: string[]; branchIds: string[]; status: string };
      occurred_at: Date | string;
    }>(
      `SELECT id, actor_user_id, actor_auth_user_id, action, target_type, target_id,
              branch_id, outcome, metadata, occurred_at
       FROM audit_events
       WHERE id = $1`,
      [auditId]
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0]?.actor_user_id, actorUserId);
    assert.equal(audit.rows[0]?.actor_auth_user_id, actorAuthUserId);
    assert.equal(audit.rows[0]?.action, "STAFF_ACCOUNT_CREATED");
    assert.equal(audit.rows[0]?.target_type, "APP_USER");
    assert.equal(audit.rows[0]?.target_id, staffId);
    assert.equal(audit.rows[0]?.branch_id, null);
    assert.equal(audit.rows[0]?.outcome, "SUCCESS");
    assert.deepEqual(audit.rows[0]?.metadata, {
      roles: ["PERSONNEL"],
      branchIds: [branchId],
      status: "pending"
    });

    await assert.rejects(pool.query("UPDATE audit_events SET outcome = 'FAILURE' WHERE id = $1", [auditId]), /append-only/i);
    await assert.rejects(pool.query("DELETE FROM audit_events WHERE id = $1", [auditId]), /append-only/i);

    const sensitiveColumns = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'audit_events'
         AND (
           lower(column_name) LIKE '%password%'
           OR lower(column_name) LIKE '%token%'
           OR lower(column_name) LIKE '%secret%'
         )`
    );
    assert.deepEqual(sensitiveColumns.rows, []);

    const rollbackService = createStaffAccountManagementService(pool, {
      createId: () => rollbackStaffId,
      createAuditId: () => "not-a-uuid"
    });
    await assert.rejects(
      rollbackService.createPendingStaffAccount({
        displayName: "Rolled Back Staff",
        email: "rollback.audit@example.test",
        roles: ["PERSONNEL"],
        branchIds: [branchId]
      }, { userId: actorUserId, authUserId: actorAuthUserId }),
      assertStaffPersistenceError
    );

    const rollbackCount = await pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM app_users WHERE id = $1",
      [rollbackStaffId]
    );
    assert.equal(rollbackCount.rows[0]?.count, 0);
  } finally {
    await resetKnownTables(pool);
    await pool.shutdown();
  }
});
