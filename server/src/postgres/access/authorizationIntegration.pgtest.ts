import assert from "node:assert/strict";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "../config.js";
import { migrationTableName, runPendingMigrations } from "../migrations.js";
import { createPgPoolManager } from "../pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "../testSafety.js";
import { createApplicationUserRepository } from "../../repositories/applicationUserRepository.js";
import { createAuthorizationRepository } from "../../repositories/authorizationRepository.js";
import { createApplicationUserService } from "../../services/applicationUserService.js";
import { AuthorizationError } from "../../services/authorizationErrors.js";
import { createAuthorizationService } from "../../services/authorizationService.js";

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

function isAuthorizationError(error: unknown, code: AuthorizationError["code"]): boolean {
  return error instanceof AuthorizationError && error.code === code;
}

test("Phase 08E PostgreSQL authorization foundation preserves grants, role separation, and branch enforcement", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownTables(pool);

  const branchA = "44444444-4444-4444-8444-444444444444";
  const branchB = "55555555-5555-4555-8555-555555555555";
  const ownerUserId = "33333333-3333-4333-8333-333333333333";
  const ownerAuthId = "22222222-2222-4222-8222-222222222222";
  const sysUserId = "66666666-6666-4666-8666-666666666666";
  const sysAuthId = "77777777-7777-4777-8777-777777777777";

  try {
    await runPendingMigrations(pool);

    const permissions = await pool.query<{ code: string; scope: string }>(
      "SELECT code, scope FROM permissions ORDER BY code ASC"
    );
    assert.equal(permissions.rows.length, 18);
    assert.equal(permissions.rows.find((row) => row.code === "patient.read")?.scope, "BRANCH");
    assert.equal(permissions.rows.find((row) => row.code === "staff_account.create")?.scope, "GLOBAL");

    const roleMapping = await pool.query<{ role_code: string; permission_code: string }>(
      `SELECT r.code AS role_code, p.code AS permission_code
       FROM role_permissions rp
       INNER JOIN roles r ON r.id = rp.role_id
       INNER JOIN permissions p ON p.id = rp.permission_id
       ORDER BY r.code, p.code`
    );

    const grantsFor = (role: string) => roleMapping.rows.filter((row) => row.role_code === role).map((row) => row.permission_code);
    assert.deepEqual(grantsFor("PATIENT"), []);
    assert.deepEqual(grantsFor("PERSONNEL").filter((code) => code.startsWith("attachment.")), [
      "attachment.create",
      "attachment.download",
      "attachment.read"
    ]);
    assert.deepEqual(grantsFor("DENTIST").filter((code) => code.startsWith("attachment.")), [
      "attachment.create",
      "attachment.delete",
      "attachment.download",
      "attachment.read",
      "attachment.update"
    ]);
    assert.deepEqual(grantsFor("CLINIC_ADMINISTRATOR"), [
      "audit.export",
      "audit.read",
      "role_assignment.approve",
      "staff_account.create",
      "user.read"
    ]);
    assert.deepEqual(grantsFor("SYSTEM_ADMINISTRATOR"), ["role_definition.configure", "user.read"]);
    assert.equal(grantsFor("SYSTEM_ADMINISTRATOR").some((code) => code.startsWith("patient.") || code.startsWith("treatment.")), false);

    await pool.query(
      `INSERT INTO branches (id, branch_code, branch_name, created_at, updated_at)
       VALUES ($1, 'MAIN', 'Main Fictional Branch', NOW(), NOW()),
              ($2, 'SECOND', 'Second Fictional Branch', NOW(), NOW())`,
      [branchA, branchB]
    );
    await pool.query(
      `INSERT INTO app_users (id, auth_user_id, email, display_name, status, created_at, updated_at)
       VALUES ($1, $2, 'owner@example.test', 'Fictional Owner Dentist', 'active', NOW(), NOW()),
              ($3, $4, 'sysadmin@example.test', 'Fictional System Administrator', 'active', NOW(), NOW())`,
      [ownerUserId, ownerAuthId, sysUserId, sysAuthId]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_at)
       SELECT $1, id, NOW() FROM roles WHERE code IN ('DENTIST', 'CLINIC_ADMINISTRATOR')`,
      [ownerUserId]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_at)
       SELECT $1, id, NOW() FROM roles WHERE code = 'SYSTEM_ADMINISTRATOR'`,
      [sysUserId]
    );
    await pool.query(
      `INSERT INTO user_branches (user_id, branch_id, assigned_at)
       VALUES ($1, $2, NOW())`,
      [ownerUserId, branchA]
    );

    const appUserService = createApplicationUserService(createApplicationUserRepository(pool));
    const authorizationService = createAuthorizationService(createAuthorizationRepository(pool));

    const ownerContext = await authorizationService.resolveContext(await appUserService.resolveByAuthUserId(ownerAuthId));
    authorizationService.requirePermission(ownerContext, "staff_account.create");
    authorizationService.requirePermission(ownerContext, "audit.read");
    authorizationService.requirePermission(ownerContext, "audit.export");
    authorizationService.requireBranchPermission(ownerContext, "treatment.finalize", branchA);
    authorizationService.requireBranchPermission(ownerContext, "attachment.delete", branchA);
    assert.throws(() => authorizationService.requireBranchPermission(ownerContext, "patient.read", branchB), (error) =>
      isAuthorizationError(error, "AUTHORIZATION_DENIED")
    );

    const sysContext = await authorizationService.resolveContext(await appUserService.resolveByAuthUserId(sysAuthId));
    authorizationService.requirePermission(sysContext, "role_definition.configure");
    assert.throws(() => authorizationService.requirePermission(sysContext, "audit.read"), (error) =>
      isAuthorizationError(error, "AUTHORIZATION_DENIED")
    );
    assert.throws(() => authorizationService.requireBranchPermission(sysContext, "patient.read", branchA), (error) =>
      isAuthorizationError(error, "AUTHORIZATION_DENIED")
    );
    assert.throws(() => authorizationService.requireBranchPermission(sysContext, "attachment.read", branchA), (error) =>
      isAuthorizationError(error, "AUTHORIZATION_DENIED")
    );

    await assert.rejects(
      pool.query(
        `INSERT INTO permissions (id, code, name, description, scope, created_at, updated_at)
         VALUES ('29999999-9999-4999-8999-999999999999', 'patient.read', 'Duplicate', 'Duplicate permission.', 'BRANCH', NOW(), NOW())`
      )
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO role_permissions (role_id, permission_id, granted_at)
         SELECT r.id, p.id, NOW()
         FROM roles r CROSS JOIN permissions p
         WHERE r.code = 'DENTIST' AND p.code = 'patient.read'`
      )
    );
  } finally {
    await resetKnownTables(pool);
    await pool.shutdown();
  }
});
