import assert from "node:assert/strict";
import { resetDisposableTestTables } from "../disposableTestReset.js";
import test from "node:test";
import { buildPgFoundationConfig, summarizeDatabaseUrl } from "../config.js";
import { runPendingMigrations } from "../migrations.js";
import { createPgPoolManager } from "../pool.js";
import { assertSafeTestDatabaseTarget, getPgIntegrationReadiness } from "../testSafety.js";
import { insertBranch } from "./branches.js";
import { allocateAnnualPatientCode } from "./patientCodeAllocation.js";
import { createPatientReadRepository } from "../../repositories/patientRepository.js";
import { createPatientReadService } from "../../services/patientReadService.js";
import { createPatientWriteService } from "../../services/patientWriteService.js";
import { PatientDomainError } from "../../services/patientDomainErrors.js";
import type { PatientWriteInput } from "../../services/patientWriteRules.js";
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

async function resetKnownBatchATestTables(pool: ReturnType<typeof createPgPoolManager>): Promise<void> {
  await resetDisposableTestTables(pool);
}

async function getCount(pool: ReturnType<typeof createPgPoolManager>, tableName: string): Promise<number> {
  const result = await pool.query<{ count: string | number }>(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count ?? 0);
}

function buildPhase07BWriteInput(overrides: Partial<PatientWriteInput> = {}): PatientWriteInput {
  return {
    branchId: fictionalBranch.id,
    dateRegistered: "2026-08-17",
    lastName: "Runtime",
    firstName: "Pat",
    birthday: "1992-03-14",
    gender: "Female",
    mobileNumber: "09170000001",
    discountEligibility: "PWD",
    disabilityType: "Mobility",
    allergyPenicillin: "Yes",
    condition_asthma: true,
    ...overrides
  };
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
    try {
      await resetKnownBatchATestTables(pool);
    } finally {
      await pool.shutdown();
    }
  }
});

test("Phase 07A Patient read path preserves list, search, identity, branch, DATE, and NULL semantics", async (t) => {
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

    const firstLegacyPatient = buildFictionalLegacyPatientRow({
      id: 201,
      patient_id: "P-2026-0011",
      last_name: "Example",
      first_name: "Bea",
      middle_name: null,
      insurance_effective_date: null,
      last_dental_visit: null,
      email_address: null,
      created_at: "2026-08-02T08:00:00.000Z",
      updated_at: "2026-08-02T08:00:00.000Z"
    });
    const secondLegacyPatient = buildFictionalLegacyPatientRow({
      id: 202,
      patient_id: "P-2026-0012",
      last_name: "Example",
      first_name: "Ana",
      middle_name: "Zed",
      mobile_number: "09990001112",
      created_at: "2026-08-03T08:00:00.000Z",
      updated_at: "2026-08-03T08:00:00.000Z"
    });

    const firstMigrated = await migrateLegacyPatient(pool, firstLegacyPatient, fictionalBranchMappings);
    const secondMigrated = await migrateLegacyPatient(pool, secondLegacyPatient, fictionalBranchMappings);
    const service = createPatientReadService(createPatientReadRepository(pool));

    const listed = await service.listPatients();
    assert.deepEqual(
      listed.map((patient) => patient.patientCode),
      [secondLegacyPatient.patient_id, firstLegacyPatient.patient_id]
    );

    const searchedByName = await service.searchPatients("ana");
    assert.deepEqual(searchedByName.map((patient) => patient.patientCode), [secondLegacyPatient.patient_id]);

    const searchedByCode = await service.searchPatients(firstLegacyPatient.patient_id);
    assert.deepEqual(searchedByCode.map((patient) => patient.patientCode), [firstLegacyPatient.patient_id]);

    const searchedByMobile = await service.searchPatients("0001112");
    assert.deepEqual(searchedByMobile.map((patient) => patient.patientCode), [secondLegacyPatient.patient_id]);

    const byId = await service.getPatientById(firstMigrated.patient.id);
    const byCode = await service.getPatientByCode(secondLegacyPatient.patient_id);

    assert.ok(byId);
    assert.ok(byCode);
    assert.equal(byId.id, firstMigrated.patient.id);
    assert.equal(byId.patientCode, firstLegacyPatient.patient_id);
    assert.equal(byId.branchId, fictionalBranch.id);
    assert.equal(byId.dateRegistered, firstLegacyPatient.date_registered);
    assert.equal(byId.birthday, firstLegacyPatient.birthday);
    assert.equal(byId.insuranceEffectiveDate, null);
    assert.equal(byId.lastDentalVisit, null);
    assert.equal(byId.emailAddress, null);
    assert.equal(byCode.id, secondMigrated.patient.id);
    assert.equal(byCode.patientCode, secondLegacyPatient.patient_id);
  } finally {
    try {
      await resetKnownBatchATestTables(pool);
    } finally {
      await pool.shutdown();
    }
  }
});

test("Phase 07B Patient write path creates, updates, validates branch, and rolls back code conflicts", async (t) => {
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
    const service = createPatientWriteService(pool);
    const createdAt = new Date("2026-08-17T12:00:00.000Z");

    const created = await service.createPatient(
      buildPhase07BWriteInput({
        insuranceEffectiveDate: null,
        lastDentalVisit: null,
        emailAddress: null
      }),
      createdAt
    );

    assert.equal(created.patientCode, "P-2026-0001");
    assert.equal(created.branchId, fictionalBranch.id);
    assert.equal(created.dateRegistered, "2026-08-17");
    assert.equal(created.birthday, "1992-03-14");
    assert.equal(created.insuranceEffectiveDate, null);
    assert.equal(created.lastDentalVisit, null);
    assert.equal(created.emailAddress, null);
    assert.equal(created.age, 34);
    assert.match(created.medicalAlertSummary || "", /Asthma/);
    assert.match(created.medicalAlertSummary || "", /Patient classification: PWD/);

    const updatedAt = new Date("2026-08-18T12:00:00.000Z");
    const updated = await service.updatePatient(
      created.id,
      buildPhase07BWriteInput({ firstName: "Updated", mobileNumber: "09170000002" }),
      updatedAt
    );

    assert.ok(updated);
    assert.equal(updated.id, created.id);
    assert.equal(updated.patientCode, created.patientCode);
    assert.equal(updated.createdAt, created.createdAt);
    assert.equal(updated.updatedAt, updatedAt.toISOString());
    assert.equal(updated.firstName, "Updated");
    assert.equal(updated.mobileNumber, "09170000002");

    const missingBranchId = "33333333-3333-4333-8333-333333333333";
    await assert.rejects(
      service.createPatient(buildPhase07BWriteInput({ branchId: missingBranchId }), createdAt),
      (error) => error instanceof PatientDomainError && error.code === "BRANCH_NOT_FOUND"
    );
    assert.equal(await getCount(pool, "patients"), 1);

    await pool.query("DELETE FROM patient_code_counters WHERE calendar_year = $1", [2026]);
    await assert.rejects(
      service.createPatient(buildPhase07BWriteInput({ mobileNumber: "09170000003" }), createdAt),
      (error) => error instanceof PatientDomainError && error.code === "CODE_CONFLICT"
    );

    const counterResult = await pool.query<{ count: string | number }>(
      "SELECT COUNT(*)::int AS count FROM patient_code_counters WHERE calendar_year = $1",
      [2026]
    );
    assert.equal(Number(counterResult.rows[0]?.count ?? 0), 0);
    assert.equal(await getCount(pool, "patients"), 1);
  } finally {
    try {
      await resetKnownBatchATestTables(pool);
    } finally {
      await pool.shutdown();
    }
  }
});

test("Phase 07C concurrent Patient creates allocate distinct annual codes and UUIDs", async (t) => {
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
    const service = createPatientWriteService(pool);
    const now = new Date("2026-08-17T12:00:00.000Z");

    const created = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        service.createPatient(
          buildPhase07BWriteInput({
            firstName: `Concurrent${index + 1}`,
            mobileNumber: `0917000001${index}`
          }),
          now
        )
      )
    );

    const patientCodes = created.map((patient) => patient.patientCode);
    const patientIds = created.map((patient) => patient.id);
    assert.equal(new Set(patientCodes).size, 5);
    assert.equal(new Set(patientIds).size, 5);
    assert.deepEqual([...patientCodes].sort(), [
      "P-2026-0001",
      "P-2026-0002",
      "P-2026-0003",
      "P-2026-0004",
      "P-2026-0005"
    ]);
    assert.equal(await getCount(pool, "patients"), 5);
  } finally {
    try {
      await resetKnownBatchATestTables(pool);
    } finally {
      await pool.shutdown();
    }
  }
});
