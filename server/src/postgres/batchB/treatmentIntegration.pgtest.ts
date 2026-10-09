import assert from "node:assert/strict";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "../config.js";
import { migrationTableName, runPendingMigrations } from "../migrations.js";
import { createPgPoolManager } from "../pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "../testSafety.js";
import { insertBranch } from "../batchA/branches.js";
import { fictionalBranch, fictionalBranchMappings, buildFictionalLegacyPatientRow } from "../batchA/patientFixtures.js";
import { migrateLegacyPatient } from "../batchA/patientMigration.js";
import { allocateAnnualTreatmentCode } from "./treatmentCodeAllocation.js";
import { buildFictionalLegacyTreatmentRow } from "./treatmentFixtures.js";
import { mapLegacyTreatmentToDraft, migrateLegacyTreatment } from "./treatmentMigration.js";
import { getTreatmentByCode } from "./treatments.js";

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

const batchBTestResetTables = [
  "email_delivery_logs",
  "notification_preferences",
  "notifications",
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

async function resetKnownBatchBTestTables(pool: ReturnType<typeof createPgPoolManager>): Promise<void> {
  for (const tableName of batchBTestResetTables) {
    await pool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
  }
}

async function getCount(pool: ReturnType<typeof createPgPoolManager>, tableName: string): Promise<number> {
  const result = await pool.query<{ count: string | number }>(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count ?? 0);
}

function assertSingleLegacyTreatmentMapRow(
  row: {
    source_system: string;
    legacy_treatment_row_id: string | number;
    legacy_treatment_code: string;
    treatment_id: string;
  } | undefined,
  migratedTreatmentId: string,
  legacyTreatment: ReturnType<typeof buildFictionalLegacyTreatmentRow>
): void {
  assert.ok(row);
  assert.equal(row?.source_system, "sqlite-v1");
  assert.equal(Number(row?.legacy_treatment_row_id), legacyTreatment.id);
  assert.equal(row?.legacy_treatment_code, legacyTreatment.treatment_id);
  assert.equal(row?.treatment_id, migratedTreatmentId);
}

test("Batch B PostgreSQL integration preserves fictional treatment parity and rerun stability", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownBatchBTestTables(pool);

  try {
    await runPendingMigrations(pool);
    await insertBranch(pool, fictionalBranch);
    await migrateLegacyPatient(pool, buildFictionalLegacyPatientRow(), fictionalBranchMappings);

    const concurrentAllocations = await Promise.all(
      [0, 1, 2].map(() => allocateAnnualTreatmentCode(pool, new Date("2026-08-17T12:00:00.000Z")))
    );
    const boundaryAllocation = await allocateAnnualTreatmentCode(
      pool,
      new Date("2025-12-31T16:30:00.000Z"),
      "Asia/Manila"
    );
    const legacyTreatment = buildFictionalLegacyTreatmentRow();
    const sourceTreatmentRowCount = 1;
    const migrated = await migrateLegacyTreatment(pool, legacyTreatment);
    const expectedPersisted = await mapLegacyTreatmentToDraft(pool, legacyTreatment, migrated.treatment.id);
    const persisted = await getTreatmentByCode(pool, legacyTreatment.treatment_id);
    const treatmentCountAfterFirstRun = await getCount(pool, "treatments");
    const mappingCountAfterFirstRun = await getCount(pool, "legacy_treatment_identity_map");
    const mapRows = await pool.query<{
      source_system: string;
      legacy_treatment_row_id: string | number;
      legacy_treatment_code: string;
      treatment_id: string;
    }>(
      `SELECT source_system, legacy_treatment_row_id, legacy_treatment_code, treatment_id
       FROM legacy_treatment_identity_map`
    );
    const rerun = await migrateLegacyTreatment(pool, legacyTreatment);
    const treatmentCountAfterRerun = await getCount(pool, "treatments");
    const mappingCountAfterRerun = await getCount(pool, "legacy_treatment_identity_map");

    assert.deepEqual(
      concurrentAllocations.map((entry) => entry.treatmentCode).sort(),
      ["T-2026-0001", "T-2026-0002", "T-2026-0003"]
    );
    assert.equal(boundaryAllocation.treatmentCode, "T-2026-0004");
    assert.ok(persisted);
    assert.deepEqual(migrated.treatment, expectedPersisted.treatment);
    assert.deepEqual(persisted, expectedPersisted.treatment);
    assert.equal(migrated.reusedExisting, false);
    assert.equal(rerun.reusedExisting, true);
    assert.equal(rerun.treatment.id, migrated.treatment.id);
    assert.equal(sourceTreatmentRowCount, 1);
    assert.equal(treatmentCountAfterFirstRun, sourceTreatmentRowCount);
    assert.equal(mappingCountAfterFirstRun, sourceTreatmentRowCount);
    assert.equal(treatmentCountAfterRerun, sourceTreatmentRowCount);
    assert.equal(mappingCountAfterRerun, sourceTreatmentRowCount);
    assert.equal(mapRows.rows.length, 1);
    assertSingleLegacyTreatmentMapRow(mapRows.rows[0], migrated.treatment.id, legacyTreatment);
  } finally {
    await pool.shutdown();
  }
});
