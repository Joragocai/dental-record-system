import assert from "node:assert/strict";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "../config.js";
import { migrationTableName, runPendingMigrations } from "../migrations.js";
import { createPgPoolManager } from "../pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "../testSafety.js";
import { createApplicationUserRepository } from "../../repositories/applicationUserRepository.js";
import { ApplicationUserError } from "../../services/applicationUserErrors.js";
import { createApplicationUserService } from "../../services/applicationUserService.js";

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
  for (const tableName of resetTables) {
    await pool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
  }
}

function assertApplicationUserError(error: unknown, code: ApplicationUserError["code"]): boolean {
  return error instanceof ApplicationUserError && error.code === code;
}

test("Phase 08D PostgreSQL application-user access foundation preserves roles, statuses, branches, and constraints", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownTables(pool);

  const userId = "33333333-3333-4333-8333-333333333333";
  const authUserId = "22222222-2222-4222-8222-222222222222";
  const branchA = "44444444-4444-4444-8444-444444444444";
  const branchB = "55555555-5555-4555-8555-555555555555";
  const pendingUserId = "66666666-6666-4666-8666-666666666666";
  const pendingAuthUserId = "77777777-7777-4777-8777-777777777777";

  try {
    await runPendingMigrations(pool);

    const roles = await pool.query<{ code: string; name: string }>(
      "SELECT code, name FROM roles ORDER BY code ASC"
    );
    assert.deepEqual(
      roles.rows,
      [
        { code: "CLINIC_ADMINISTRATOR", name: "Clinic Administrator" },
        { code: "DENTIST", name: "Dentist" },
        { code: "PATIENT", name: "Patient" },
        { code: "PERSONNEL", name: "Personnel" },
        { code: "SYSTEM_ADMINISTRATOR", name: "System Administrator" }
      ]
    );

    await pool.query(
      `INSERT INTO branches (id, branch_code, branch_name, created_at, updated_at)
       VALUES ($1, 'MAIN', 'Main Fictional Branch', NOW(), NOW()),
              ($2, 'SECOND', 'Second Fictional Branch', NOW(), NOW())`,
      [branchA, branchB]
    );

    await pool.query(
      `INSERT INTO app_users (id, auth_user_id, email, display_name, status, created_at, updated_at)
       VALUES ($1, $2, 'owner.dentist@example.test', 'Fictional Owner Dentist', 'active', NOW(), NOW()),
              ($3, $4, 'pending.staff@example.test', 'Pending Fictional Staff', 'pending', NOW(), NOW())`,
      [userId, authUserId, pendingUserId, pendingAuthUserId]
    );

    await pool.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_at)
       SELECT $1, id, NOW()
       FROM roles
       WHERE code IN ('DENTIST', 'CLINIC_ADMINISTRATOR')`,
      [userId]
    );
    await pool.query(
      `INSERT INTO user_branches (user_id, branch_id, assigned_at)
       VALUES ($1, $2, NOW()), ($1, $3, NOW())`,
      [userId, branchA, branchB]
    );

    const service = createApplicationUserService(createApplicationUserRepository(pool));
    const context = await service.resolveByAuthUserId(authUserId);
    assert.equal(context.userId, userId);
    assert.equal(context.status, "active");
    assert.deepEqual(context.roles, ["CLINIC_ADMINISTRATOR", "DENTIST"]);
    assert.deepEqual(context.branchIds, [branchA, branchB]);
    assert.equal(context.roles.includes("SYSTEM_ADMINISTRATOR"), false);

    await assert.rejects(service.resolveByAuthUserId(pendingAuthUserId), (error) =>
      assertApplicationUserError(error, "APPLICATION_USER_PENDING")
    );

    await assert.rejects(
      pool.query(
        `INSERT INTO app_users (id, auth_user_id, email, display_name, status, created_at, updated_at)
         VALUES ('88888888-8888-4888-8888-888888888888', $1, 'duplicate-auth@example.test', 'Duplicate Auth', 'active', NOW(), NOW())`,
        [authUserId]
      )
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO app_users (id, email, display_name, status, created_at, updated_at)
         VALUES ('99999999-9999-4999-8999-999999999999', 'OWNER.DENTIST@example.test', 'Duplicate Email', 'pending', NOW(), NOW())`
      )
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO user_roles (user_id, role_id, assigned_at)
         SELECT $1, id, NOW() FROM roles WHERE code = 'DENTIST'`,
        [userId]
      )
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO user_branches (user_id, branch_id, assigned_at)
         VALUES ($1, $2, NOW())`,
        [userId, branchA]
      )
    );

    const sensitiveColumns = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name IN ('app_users', 'roles', 'user_roles', 'user_branches')
         AND (
           lower(column_name) LIKE '%password%'
           OR lower(column_name) LIKE '%token%'
           OR lower(column_name) LIKE '%secret%'
         )`
    );
    assert.deepEqual(sensitiveColumns.rows, []);
  } finally {
    await resetKnownTables(pool);
    await pool.shutdown();
  }
});
