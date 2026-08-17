import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import {
  allocateAnnualPatientCode,
  formatPatientCode,
  getPatientCodeCalendarYear
} from "./patientCodeAllocation.js";
import { mapLegacyPatientToDraft, migrateLegacyPatient, resolveMappedBranchId } from "./patientMigration.js";
import { buildFictionalLegacyPatientRow, fictionalBranchMappings } from "./patientFixtures.js";
import { patientInsertColumns, type LegacyPatientIdentityMapRecord, type NewPatientRecord } from "./patients.js";
import type { PgMigrationTransactionRunner } from "./patientMigration.js";
import type { PgQueryExecutor } from "../pool.js";

interface CounterRow extends QueryResultRow {
  last_sequence: number;
}

type PatientRowRecord = Record<(typeof patientInsertColumns)[number], unknown>;

class FakeMigrationRunner implements PgMigrationTransactionRunner {
  private readonly patientsById = new Map<string, PatientRowRecord>();
  private readonly patientIdsByCode = new Map<string, string>();
  private readonly legacyMaps: LegacyPatientIdentityMapRecord[] = [];

  failPatientInsert = false;
  failLegacyMapInsert = false;
  transactionCalls = 0;

  get patientCount(): number {
    return this.patientsById.size;
  }

  get mappingCount(): number {
    return this.legacyMaps.length;
  }

  seedPatient(patient: NewPatientRecord): void {
    this.storePatientRow(
      Object.fromEntries(patientInsertColumns.map((columnName, index) => [columnName, this.toInsertValues(patient)[index]]))
    );
  }

  private toInsertValues(patient: NewPatientRecord): readonly unknown[] {
    return [
      patient.id,
      patient.patientCode,
      patient.branchId,
      patient.dateRegistered,
      patient.lastName,
      patient.firstName,
      patient.middleName,
      patient.birthday,
      patient.age,
      patient.gender,
      patient.religion,
      patient.nationality,
      patient.nickname,
      patient.patientOccupation,
      patient.dentalInsurance,
      patient.insuranceEffectiveDate,
      patient.previousDentist,
      patient.lastDentalVisit,
      patient.mobileNumber,
      patient.emailAddress,
      patient.discountEligibility,
      patient.homeAddress,
      patient.homeNumber,
      patient.officeNumber,
      patient.faxNumber,
      patient.isMinor,
      patient.parentGuardianName,
      patient.parentGuardianOccupation,
      patient.referralSource,
      patient.reasonForConsultation,
      patient.goodHealth,
      patient.underMedicalTreatment,
      patient.medicalTreatmentDetails,
      patient.seriousIllnessHistory,
      patient.seriousIllnessDetails,
      patient.hospitalizedHistory,
      patient.hospitalizationDetails,
      patient.takingMedications,
      patient.medicationDetails,
      patient.usesTobacco,
      patient.usesAlcoholOrDrugs,
      patient.disabilityType,
      patient.pregnant,
      patient.nursing,
      patient.birthControlPills,
      patient.physicianName,
      patient.physicianSpecialty,
      patient.physicianOfficeNumber,
      patient.physicianOfficeAddress,
      patient.allergicToItems,
      patient.bloodType,
      patient.bloodPressure,
      patient.allergyLocalAnesthetic,
      patient.localAnestheticDetails,
      patient.allergyPenicillin,
      patient.allergySulfa,
      patient.allergyAspirin,
      patient.allergyLatex,
      patient.allergyOthers,
      patient.allergyOthersDetails,
      patient.condition_high_blood_pressure,
      patient.condition_low_blood_pressure,
      patient.condition_epilepsy_convulsions,
      patient.condition_aids_hiv,
      patient.condition_std,
      patient.condition_stomach_troubles,
      patient.condition_fainting_seizure,
      patient.condition_rapid_weight_loss,
      patient.condition_radiation_therapy,
      patient.condition_joint_replacement,
      patient.condition_heart_surgery,
      patient.condition_heart_attack,
      patient.condition_thyroid_problem,
      patient.condition_heart_disease,
      patient.condition_heart_murmur,
      patient.condition_hepatitis_liver_disease,
      patient.condition_rheumatic_fever,
      patient.condition_hay_fever_allergies,
      patient.condition_respiratory_problems,
      patient.condition_hepatitis_jaundice,
      patient.condition_tuberculosis,
      patient.condition_swollen_ankles,
      patient.condition_kidney_disease,
      patient.condition_diabetes,
      patient.condition_chest_pain,
      patient.condition_stroke,
      patient.condition_cancer_tumors,
      patient.condition_anemia,
      patient.condition_angina,
      patient.condition_asthma,
      patient.condition_emphysema,
      patient.condition_bleeding_problems,
      patient.condition_blood_diseases,
      patient.condition_head_injuries,
      patient.condition_arthritis_rheumatism,
      patient.otherMedicalCondition,
      patient.otherMedicalConditionDetails,
      patient.medicalAlertSummary,
      patient.createdAt,
      patient.updatedAt
    ];
  }

  private buildResult<R extends QueryResultRow>(rows: R[]): QueryResult<R> {
    return {
      command: "SELECT",
      rowCount: rows.length,
      oid: 0,
      fields: [],
      rows
    };
  }

  private storePatientRow(row: Record<string, unknown>): void {
    const patientId = String(row.id);
    const patientCode = String(row.patient_code);
    this.patientsById.set(patientId, row as PatientRowRecord);
    this.patientIdsByCode.set(patientCode, patientId);
  }

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<R>>;
  async query(text: string, values?: readonly unknown[]): Promise<QueryResult<QueryResultRow>> {
    const normalized = text.replace(/\s+/g, " ").trim();

    if (normalized.startsWith("SELECT m.source_system,")) {
      const sourceSystem = String(values?.[0]);
      const legacyPatientRowId = Number(values?.[1]);
      const legacyPatientCode = String(values?.[2]);
      const rows = this.legacyMaps
        .filter(
          (record) =>
            record.sourceSystem === sourceSystem &&
            (record.legacyPatientRowId === legacyPatientRowId || record.legacyPatientCode === legacyPatientCode)
        )
        .map((record) => {
          const patientRow = this.patientsById.get(record.patientId);
          if (!patientRow) {
            throw new Error("Seeded legacy map points to a missing patient row.");
          }

          return {
            source_system: record.sourceSystem,
            legacy_patient_row_id: record.legacyPatientRowId,
            legacy_patient_code: record.legacyPatientCode,
            mapping_created_at: record.createdAt,
            ...patientRow
          };
        });

      return this.buildResult(rows);
    }

    if (normalized === "SELECT * FROM patients WHERE patient_code = $1") {
      const patientCode = String(values?.[0]);
      const patientId = this.patientIdsByCode.get(patientCode);
      const row = patientId ? this.patientsById.get(patientId) : undefined;
      return this.buildResult(row ? [row] : []);
    }

    if (normalized.startsWith("INSERT INTO patients (")) {
      if (this.failPatientInsert) {
        throw new Error("forced patient insert failure");
      }

      const row = Object.fromEntries(
        patientInsertColumns.map((columnName, index) => [columnName, values?.[index] ?? null])
      );
      const patientCode = String(row.patient_code);
      if (this.patientIdsByCode.has(patientCode)) {
        throw new Error(`duplicate patient_code ${patientCode}`);
      }

      this.storePatientRow(row);
      return this.buildResult([row]);
    }

    if (normalized.startsWith("INSERT INTO legacy_patient_identity_map")) {
      if (this.failLegacyMapInsert) {
        throw new Error("forced legacy map insert failure");
      }

      const record: LegacyPatientIdentityMapRecord = {
        sourceSystem: String(values?.[0]),
        legacyPatientRowId: Number(values?.[1]),
        legacyPatientCode: String(values?.[2]),
        patientId: String(values?.[3]),
        createdAt: String(values?.[4])
      };

      const hasConflict = this.legacyMaps.some(
        (existing) =>
          (existing.sourceSystem === record.sourceSystem &&
            existing.legacyPatientRowId === record.legacyPatientRowId) ||
          (existing.sourceSystem === record.sourceSystem &&
            existing.legacyPatientCode === record.legacyPatientCode) ||
          existing.patientId === record.patientId
      );
      if (hasConflict) {
        throw new Error("duplicate legacy map");
      }

      this.legacyMaps.push(record);
      return this.buildResult([]);
    }

    throw new Error(`Unexpected SQL in FakeMigrationRunner: ${normalized}`);
  }

  async withTransaction<T>(callback: (executor: PgQueryExecutor) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    const patientSnapshot = structuredClone([...this.patientsById.entries()]);
    const codeSnapshot = structuredClone([...this.patientIdsByCode.entries()]);
    const mapSnapshot = structuredClone(this.legacyMaps);

    try {
      return await callback(this);
    } catch (error) {
      this.patientsById.clear();
      this.patientIdsByCode.clear();
      this.legacyMaps.length = 0;

      for (const [patientId, row] of patientSnapshot) {
        this.patientsById.set(patientId, row);
      }
      for (const [patientCode, patientId] of codeSnapshot) {
        this.patientIdsByCode.set(patientCode, patientId);
      }
      this.legacyMaps.push(...mapSnapshot);
      throw error;
    }
  }
}

class FakeAllocationExecutor implements PgQueryExecutor {
  private readonly counters = new Map<number, number>();

  private buildResult<R extends QueryResultRow>(rows: R[]): QueryResult<R> {
    return {
      command: "SELECT",
      rowCount: rows.length,
      oid: 0,
      fields: [],
      rows
    };
  }

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<R>>;
  async query(text: string, values?: readonly unknown[]): Promise<QueryResult<CounterRow>> {
    const normalized = text.replace(/\s+/g, " ").trim();

    if (!normalized.startsWith("INSERT INTO patient_code_counters")) {
      throw new Error(`Unexpected SQL in FakeAllocationExecutor: ${normalized}`);
    }

    const year = Number(values?.[0]);
    const next = (this.counters.get(year) ?? 0) + 1;
    this.counters.set(year, next);
    return this.buildResult([{ last_sequence: next }]);
  }
}

test("formatPatientCode preserves the visible V1 patient-code format", () => {
  assert.equal(formatPatientCode(2026, 1), "P-2026-0001");
  assert.equal(formatPatientCode(2026, 19), "P-2026-0019");
});

test("allocateAnnualPatientCode increments within a year and resets by year", async () => {
  const executor = new FakeAllocationExecutor();

  const first = await allocateAnnualPatientCode(executor, new Date("2026-08-17T12:00:00.000Z"));
  const second = await allocateAnnualPatientCode(executor, new Date("2026-12-01T12:00:00.000Z"));
  const nextYear = await allocateAnnualPatientCode(executor, new Date("2027-01-01T12:00:00.000Z"));

  assert.equal(first.patientCode, "P-2026-0001");
  assert.equal(second.patientCode, "P-2026-0002");
  assert.equal(nextYear.patientCode, "P-2027-0001");
});

test("getPatientCodeCalendarYear uses the approved clinic timezone at the new-year boundary", () => {
  assert.equal(getPatientCodeCalendarYear(new Date("2026-12-31T15:59:59.000Z"), "Asia/Manila"), 2026);
  assert.equal(getPatientCodeCalendarYear(new Date("2026-12-31T16:00:00.000Z"), "Asia/Manila"), 2027);
  assert.equal(getPatientCodeCalendarYear(new Date("2027-01-01T00:00:00+08:00"), "Asia/Manila"), 2027);
});

test("resolveMappedBranchId requires an explicit legacy branch mapping", () => {
  assert.equal(
    resolveMappedBranchId("Fictional Alpha Front Desk", fictionalBranchMappings),
    fictionalBranchMappings[0]?.branchId
  );
  assert.throws(
    () => resolveMappedBranchId("Unknown Branch", fictionalBranchMappings),
    /No V2 branch mapping exists/
  );
});

test("mapLegacyPatientToDraft preserves patient code and converts condition flags", () => {
  const legacyPatient = buildFictionalLegacyPatientRow({
    condition_asthma: 1,
    condition_hay_fever_allergies: 1,
    condition_diabetes: 0
  });

  const mapped = mapLegacyPatientToDraft(legacyPatient, fictionalBranchMappings);

  assert.match(mapped.patient.id, /^[0-9a-f-]{36}$/i);
  assert.equal(mapped.patient.patientCode, legacyPatient.patient_id);
  assert.equal(mapped.patient.branchId, fictionalBranchMappings[0]?.branchId);
  assert.equal(mapped.patient.condition_asthma, true);
  assert.equal(mapped.patient.condition_hay_fever_allergies, true);
  assert.equal(mapped.patient.condition_diabetes, false);
  assert.equal(mapped.legacyIdentityMap.legacyPatientRowId, legacyPatient.id);
  assert.equal(mapped.legacyIdentityMap.legacyPatientCode, legacyPatient.patient_id);
});

test("mapLegacyPatientToDraft normalizes blank optional strings to null without trimming required fields", () => {
  const legacyPatient = buildFictionalLegacyPatientRow({
    first_name: "  Pat  ",
    medical_treatment_details: "   ",
    hospitalization_details: "",
    medication_details: "  "
  });

  const mapped = mapLegacyPatientToDraft(legacyPatient, fictionalBranchMappings);

  assert.equal(mapped.patient.firstName, "  Pat  ");
  assert.equal(mapped.patient.medicalTreatmentDetails, null);
  assert.equal(mapped.patient.hospitalizationDetails, null);
  assert.equal(mapped.patient.medicationDetails, null);
});

test("migrateLegacyPatient persists both patient and legacy identity map in one transaction", async () => {
  const runner = new FakeMigrationRunner();
  const legacyPatient = buildFictionalLegacyPatientRow();

  const migrated = await migrateLegacyPatient(runner, legacyPatient, fictionalBranchMappings);

  assert.equal(migrated.reusedExisting, false);
  assert.equal(runner.transactionCalls, 1);
  assert.equal(runner.patientCount, 1);
  assert.equal(runner.mappingCount, 1);
});

test("migrateLegacyPatient rolls back the patient insert when the legacy map insert fails", async () => {
  const runner = new FakeMigrationRunner();
  runner.failLegacyMapInsert = true;

  await assert.rejects(
    async () => migrateLegacyPatient(runner, buildFictionalLegacyPatientRow(), fictionalBranchMappings),
    /forced legacy map insert failure/
  );

  assert.equal(runner.patientCount, 0);
  assert.equal(runner.mappingCount, 0);
});

test("migrateLegacyPatient leaves no legacy map behind when the patient insert fails", async () => {
  const runner = new FakeMigrationRunner();
  runner.failPatientInsert = true;

  await assert.rejects(
    async () => migrateLegacyPatient(runner, buildFictionalLegacyPatientRow(), fictionalBranchMappings),
    /forced patient insert failure/
  );

  assert.equal(runner.patientCount, 0);
  assert.equal(runner.mappingCount, 0);
});

test("migrateLegacyPatient reuses an existing matching migration on rerun", async () => {
  const runner = new FakeMigrationRunner();
  const legacyPatient = buildFictionalLegacyPatientRow();

  const firstRun = await migrateLegacyPatient(runner, legacyPatient, fictionalBranchMappings);
  const secondRun = await migrateLegacyPatient(runner, legacyPatient, fictionalBranchMappings);

  assert.equal(firstRun.reusedExisting, false);
  assert.equal(secondRun.reusedExisting, true);
  assert.equal(secondRun.patient.id, firstRun.patient.id);
  assert.equal(runner.patientCount, 1);
  assert.equal(runner.mappingCount, 1);
});

test("migrateLegacyPatient rejects a patient-code conflict without a matching legacy map", async () => {
  const runner = new FakeMigrationRunner();
  const legacyPatient = buildFictionalLegacyPatientRow();
  const seeded = mapLegacyPatientToDraft(legacyPatient, fictionalBranchMappings, "22222222-2222-4222-8222-222222222222");
  runner.seedPatient(seeded.patient);

  await assert.rejects(
    async () => migrateLegacyPatient(runner, legacyPatient, fictionalBranchMappings),
    /already exists without a matching legacy identity mapping/
  );
});

test("mapLegacyPatientToDraft rejects malformed dates before writing data", () => {
  const badLegacyPatient = buildFictionalLegacyPatientRow({
    last_dental_visit: "08/17/2026"
  });

  assert.throws(
    () => mapLegacyPatientToDraft(badLegacyPatient, fictionalBranchMappings),
    /last_dental_visit must use YYYY-MM-DD format/
  );
});
