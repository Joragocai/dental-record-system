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
  for (const tableName of resetTables) {
    await pool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
  }
}

function assertStaffError(error: unknown, code: StaffAccountError["code"]): boolean {
  return error instanceof StaffAccountError && error.code === code;
}

test("Phase 08G PostgreSQL staff account foundation creates pending operational staff atomically", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownTables(pool);

  const branchA = "22222222-2222-4222-8222-222222222222";
  const branchB = "33333333-3333-4333-8333-333333333333";
  const staffId = "44444444-4444-4444-8444-444444444444";
  const invalidStaffId = "55555555-5555-4555-8555-555555555555";

  try {
    await runPendingMigrations(pool);
    await pool.query(
      `INSERT INTO branches (id, branch_code, branch_name, created_at, updated_at)
       VALUES ($1, 'MAIN', 'Main Fictional Branch', NOW(), NOW()),
              ($2, 'SECOND', 'Second Fictional Branch', NOW(), NOW())`,
      [branchA, branchB]
    );

    const service = createStaffAccountManagementService(pool, { createId: () => staffId });
    const created = await service.createPendingStaffAccount({
      displayName: "Fictional Dentist",
      email: "Dentist.Staff@Example.Test",
      roles: ["DENTIST", "PERSONNEL"],
      branchIds: [branchB, branchA]
    });

    assert.deepEqual(created, {
      id: staffId,
      email: "dentist.staff@example.test",
      displayName: "Fictional Dentist",
      status: "pending",
      roles: ["DENTIST", "PERSONNEL"],
      branchIds: [branchA, branchB]
    });

    const userRows = await pool.query<{
      id: string;
      auth_user_id: string | null;
      email: string;
      display_name: string;
      status: string;
    }>(
      `SELECT id, auth_user_id, email, display_name, status
       FROM app_users
       WHERE id = $1`,
      [staffId]
    );
    assert.deepEqual(userRows.rows, [{
      id: staffId,
      auth_user_id: null,
      email: "dentist.staff@example.test",
      display_name: "Fictional Dentist",
      status: "pending"
    }]);

    const roleRows = await pool.query<{ code: string }>(
      `SELECT r.code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1
       ORDER BY r.code`,
      [staffId]
    );
    assert.deepEqual(roleRows.rows, [{ code: "DENTIST" }, { code: "PERSONNEL" }]);

    const branchRows = await pool.query<{ branch_id: string }>(
      `SELECT branch_id
       FROM user_branches
       WHERE user_id = $1
       ORDER BY branch_id`,
      [staffId]
    );
    assert.deepEqual(branchRows.rows, [{ branch_id: branchA }, { branch_id: branchB }]);

    const duplicateService = createStaffAccountManagementService(pool, {
      createId: () => "66666666-6666-4666-8666-666666666666"
    });
    await assert.rejects(
      duplicateService.createPendingStaffAccount({
        displayName: "Duplicate Email",
        email: "DENTIST.STAFF@example.test",
        roles: ["PERSONNEL"],
        branchIds: [branchA]
      }),
      (error) => assertStaffError(error, "STAFF_ACCOUNT_EMAIL_CONFLICT")
    );

    const invalidBranchService = createStaffAccountManagementService(pool, { createId: () => invalidStaffId });
    await assert.rejects(
      invalidBranchService.createPendingStaffAccount({
        displayName: "Invalid Branch",
        email: "invalid.branch@example.test",
        roles: ["PERSONNEL"],
        branchIds: ["77777777-7777-4777-8777-777777777777"]
      }),
      (error) => assertStaffError(error, "STAFF_ACCOUNT_BRANCH_INVALID")
    );

    const rolledBack = await pool.query<{ count: string | number }>(
      `SELECT COUNT(*)::int AS count
       FROM app_users
       WHERE id = $1 OR email = 'invalid.branch@example.test'`,
      [invalidStaffId]
    );
    assert.equal(Number(rolledBack.rows[0]?.count ?? 0), 0);
  } finally {
    await resetKnownTables(pool);
    await pool.shutdown();
  }
});
