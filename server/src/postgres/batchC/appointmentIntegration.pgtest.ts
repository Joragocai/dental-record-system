import assert from "node:assert/strict";
import { resetDisposableTestTables } from "../disposableTestReset.js";
import test from "node:test";
import { insertBranch } from "../batchA/branches.js";
import { buildFictionalLegacyPatientRow, fictionalBranch, fictionalBranchMappings } from "../batchA/patientFixtures.js";
import { migrateLegacyPatient } from "../batchA/patientMigration.js";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "../config.js";
import { runPendingMigrations } from "../migrations.js";
import { createPgPoolManager } from "../pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "../testSafety.js";
import { buildFictionalLegacyAppointmentRow } from "./appointmentFixtures.js";
import { mapLegacyAppointmentToDraft, migrateLegacyAppointment } from "./appointmentMigration.js";
import { insertAppointment, listLegacyAppointmentMigrationStates, type NewAppointmentRecord } from "./appointments.js";

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

async function resetKnownBatchCTestTables(pool: ReturnType<typeof createPgPoolManager>): Promise<void> {
  await resetDisposableTestTables(pool);
}

async function getCount(pool: ReturnType<typeof createPgPoolManager>, tableName: string): Promise<number> {
  const result = await pool.query<{ count: string | number }>(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count ?? 0);
}

test("Batch C PostgreSQL integration preserves fictional appointment parity and branch snapshot stability", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownBatchCTestTables(pool);

  try {
    await runPendingMigrations(pool);
    await insertBranch(pool, fictionalBranch);
    const migratedPatient = await migrateLegacyPatient(pool, buildFictionalLegacyPatientRow(), fictionalBranchMappings);
    const firstLegacyAppointment = buildFictionalLegacyAppointmentRow({
      created_at: "2026-08-20 08:00:00",
      updated_at: "2026-08-20T08:30:00.000Z"
    });
    const secondLegacyAppointment = buildFictionalLegacyAppointmentRow({
      id: 902,
      created_at: "2026-08-20T09:00:00.000Z",
      updated_at: "2026-08-20 09:30:00"
    });
    const sourceAppointmentRowCount = 2;
    const firstMigrated = await migrateLegacyAppointment(pool, firstLegacyAppointment);
    const secondMigrated = await migrateLegacyAppointment(pool, secondLegacyAppointment);
    const expectedFirstPersisted = await mapLegacyAppointmentToDraft(
      pool,
      firstLegacyAppointment,
      firstMigrated.appointment.id
    );
    const expectedSecondPersisted = await mapLegacyAppointmentToDraft(
      pool,
      secondLegacyAppointment,
      secondMigrated.appointment.id
    );
    const firstExistingStates = await listLegacyAppointmentMigrationStates(pool, "sqlite-v1", firstLegacyAppointment.id);
    const secondExistingStates = await listLegacyAppointmentMigrationStates(pool, "sqlite-v1", secondLegacyAppointment.id);
    const appointmentCountAfterFirstRun = await getCount(pool, "appointments");
    const mappingCountAfterFirstRun = await getCount(pool, "legacy_appointment_identity_map");
    const firstRerun = await migrateLegacyAppointment(pool, firstLegacyAppointment);
    const secondRerun = await migrateLegacyAppointment(pool, secondLegacyAppointment);
    const appointmentCountAfterRerun = await getCount(pool, "appointments");
    const mappingCountAfterRerun = await getCount(pool, "legacy_appointment_identity_map");

    assert.deepEqual(firstMigrated.appointment, expectedFirstPersisted.appointment);
    assert.deepEqual(secondMigrated.appointment, expectedSecondPersisted.appointment);
    assert.deepEqual(firstExistingStates[0]?.appointment, expectedFirstPersisted.appointment);
    assert.deepEqual(secondExistingStates[0]?.appointment, expectedSecondPersisted.appointment);
    assert.equal(firstMigrated.appointment.patientId, migratedPatient.patient.id);
    assert.equal(firstMigrated.appointment.branchId, migratedPatient.patient.branchId);
    assert.equal(secondMigrated.appointment.patientId, migratedPatient.patient.id);
    assert.equal(secondMigrated.appointment.branchId, migratedPatient.patient.branchId);
    assert.notEqual(firstMigrated.appointment.id, secondMigrated.appointment.id);
    assert.equal(firstExistingStates.length, 1);
    assert.equal(secondExistingStates.length, 1);
    assert.equal(firstExistingStates[0]?.sourceSystem, "sqlite-v1");
    assert.equal(secondExistingStates[0]?.sourceSystem, "sqlite-v1");
    assert.equal(firstExistingStates[0]?.legacyAppointmentRowId, firstLegacyAppointment.id);
    assert.equal(secondExistingStates[0]?.legacyAppointmentRowId, secondLegacyAppointment.id);
    assert.equal(firstExistingStates[0]?.appointment.id, firstMigrated.appointment.id);
    assert.equal(secondExistingStates[0]?.appointment.id, secondMigrated.appointment.id);
    assert.equal(sourceAppointmentRowCount, 2);
    assert.equal(appointmentCountAfterFirstRun, sourceAppointmentRowCount);
    assert.equal(mappingCountAfterFirstRun, sourceAppointmentRowCount);
    assert.equal(firstRerun.reusedExisting, true);
    assert.equal(secondRerun.reusedExisting, true);
    assert.equal(firstRerun.appointment.id, firstMigrated.appointment.id);
    assert.equal(secondRerun.appointment.id, secondMigrated.appointment.id);
    assert.equal(appointmentCountAfterRerun, sourceAppointmentRowCount);
    assert.equal(mappingCountAfterRerun, sourceAppointmentRowCount);
  } finally {
    try {
      await resetKnownBatchCTestTables(pool);
    } finally {
      await pool.shutdown();
    }
  }
});

test("Batch C PostgreSQL integration enforces branch FK on appointments", async (t) => {
  const readiness = getPgIntegrationReadiness(process.env);
  if (!readiness.ready) {
    t.skip(readiness.reason || "TEST_DATABASE_URL is not configured for safe PostgreSQL integration.");
    return;
  }

  const pool = createPgPoolManager(buildTestDatabaseConfig());
  await resetKnownBatchCTestTables(pool);

  try {
    await runPendingMigrations(pool);
    await insertBranch(pool, fictionalBranch);
    const migratedPatient = await migrateLegacyPatient(pool, buildFictionalLegacyPatientRow(), fictionalBranchMappings);

    const invalidBranchAppointment: NewAppointmentRecord = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: migratedPatient.patient.id,
      branchId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      appointmentDate: "2026-08-26",
      appointmentTime: "09:15",
      plannedProcedure: "Consultation",
      notes: null,
      status: "confirmed",
      createdAt: "2026-08-20T08:00:00.000Z",
      updatedAt: "2026-08-20T08:30:00.000Z"
    };

    await assert.rejects(
      async () => insertAppointment(pool, invalidBranchAppointment),
      /foreign key/i
    );
    assert.equal(await getCount(pool, "appointments"), 0);
  } finally {
    try {
      await resetKnownBatchCTestTables(pool);
    } finally {
      await pool.shutdown();
    }
  }
});
