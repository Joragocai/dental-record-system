import assert from "node:assert/strict";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "../config.js";
import { migrationTableName, runPendingMigrations } from "../migrations.js";
import { createPgPoolManager } from "../pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "../testSafety.js";
import { insertBranch } from "./branches.js";
import { allocateAnnualPatientCode } from "./patientCodeAllocation.js";
import { buildFictionalLegacyPatientRow, fictionalBranch, fictionalBranchMappings } from "./patientFixtures.js";
import { mapLegacyPatientToDraft, migrateLegacyPatient } from "./patientMigration.js";
import { getPatientByCode } from "./patients.js";

function buildTestDatabaseConfig() {
  const config = buildPgFoundationConfig(process.env);
  if (!config.testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is not configured.");
  }

  assertSafeTestDatabaseTarget(config.testDatabaseUrl, config.databaseUrl, config.appEnv);
  const summary = summarizeDatabaseUrl(config.testDatabaseUrl, config.sslMode, config.appEnv);

  return {
    ...config,
    ...summary,
    databaseUrl: config.testDatabaseUrl
  };
}

const batchATestResetTables = [
  "legacy_patient_identity_map",
  "patients",
  "patient_code_counters",
  "branches",
  "drs_v2_foundation_probe",
  migrationTableName
] as const;

async function resetKnownBatchATestTables(pool: ReturnType<typeof createPgPoolManager>): Promise<void> {
  for (const tableName of batchATestResetTables) {
    await pool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
  }
}

async function getCount(pool: ReturnType<typeof createPgPoolManager>, tableName: string): Promise<number> {
  const result = await pool.query<{ count: string | number }>(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count ?? 0);
}

test("Batch A PostgreSQL integration preserves fictional patient parity", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownBatchATestTables(pool);

  try {
    await runPendingMigrations(pool);
    await insertBranch(pool, fictionalBranch);

    const allocatedCodes = await Promise.all(
      [0, 1, 2].map(() => allocateAnnualPatientCode(pool, new Date("2026-08-17T12:00:00.000Z")))
    );
    assert.deepEqual(
      allocatedCodes.map((entry) => entry.patientCode).sort(),
      ["P-2026-0001", "P-2026-0002", "P-2026-0003"]
    );

    const legacyPatient = buildFictionalLegacyPatientRow({
      patient_id: "P-2026-0007"
    });
    const migrated = await migrateLegacyPatient(pool, legacyPatient, fictionalBranchMappings);
    const rerun = await migrateLegacyPatient(pool, legacyPatient, fictionalBranchMappings);
    const persisted = await getPatientByCode(pool, legacyPatient.patient_id);
    const expected = persisted ? mapLegacyPatientToDraft(legacyPatient, fictionalBranchMappings, persisted.id).patient : null;
    const patientCount = await getCount(pool, "patients");
    const mappingCount = await getCount(pool, "legacy_patient_identity_map");
    const mapRows = await pool.query<{
      source_system: string;
      legacy_patient_row_id: string | number;
      legacy_patient_code: string;
      patient_id: string;
    }>(
      `SELECT source_system, legacy_patient_row_id, legacy_patient_code, patient_id
       FROM legacy_patient_identity_map`
    );

    assert.ok(persisted);
    assert.ok(expected);
    assert.deepEqual(persisted, expected);
    assert.equal(migrated.reusedExisting, false);
    assert.equal(rerun.reusedExisting, true);
    assert.equal(rerun.patient.id, migrated.patient.id);
    assert.equal(migrated.legacyIdentityMap.patientId, persisted?.id);
    assert.equal(patientCount, 1);
    assert.equal(mappingCount, 1);
    assert.equal(mapRows.rows.length, 1);
    assert.equal(mapRows.rows[0]?.source_system, "sqlite-v1");
    assert.equal(Number(mapRows.rows[0]?.legacy_patient_row_id), legacyPatient.id);
    assert.equal(mapRows.rows[0]?.legacy_patient_code, legacyPatient.patient_id);
    assert.equal(mapRows.rows[0]?.patient_id, persisted.id);
  } finally {
    await pool.shutdown();
  }
});
