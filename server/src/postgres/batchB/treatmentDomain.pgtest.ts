import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import { buildFictionalLegacyPatientRow, fictionalBranchMappings } from "../batchA/patientFixtures.js";
import { mapLegacyPatientToDraft, type BranchLocationMapping } from "../batchA/patientMigration.js";
import { patientInsertColumns, type LegacyPatientIdentityMapRecord, type NewPatientRecord } from "../batchA/patients.js";
import type { PgQueryExecutor } from "../pool.js";
import {
  allocateAnnualTreatmentCode,
  formatTreatmentCode,
  getTreatmentCodeCalendarYear
} from "./treatmentCodeAllocation.js";
import { buildFictionalLegacyTreatmentRow } from "./treatmentFixtures.js";
import {
  mapLegacyTreatmentToDraft,
  migrateLegacyTreatment,
  type LegacyTreatmentRow,
  type PgTreatmentMigrationRunner
} from "./treatmentMigration.js";
import { treatmentInsertColumns, type LegacyTreatmentIdentityMapRecord, type NewTreatmentRecord } from "./treatments.js";

type PatientRowRecord = Record<(typeof patientInsertColumns)[number], unknown>;
type TreatmentRowRecord = Record<(typeof treatmentInsertColumns)[number], unknown>;

interface CounterRow extends QueryResultRow {
  last_sequence: number;
}

function buildResult<R extends QueryResultRow>(rows: R[]): QueryResult<R> {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows
  };
}

function toPatientInsertValues(patient: NewPatientRecord): readonly unknown[] {
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

function buildPatientRow(patient: NewPatientRecord): PatientRowRecord {
  return Object.fromEntries(
    patientInsertColumns.map((columnName, index) => [columnName, toPatientInsertValues(patient)[index]])
  ) as PatientRowRecord;
}

function toTreatmentInsertValues(treatment: NewTreatmentRecord): readonly unknown[] {
  return [
    treatment.id,
    treatment.treatmentCode,
    treatment.patientId,
    treatment.treatmentDate,
    treatment.toothNumbers,
    treatment.nextAppointmentDate,
    treatment.nextAppointmentTime,
    treatment.procedure,
    treatment.dentists,
    treatment.amountCharged,
    treatment.discountType,
    treatment.discountPercent,
    treatment.discountAmount,
    treatment.netAmountDue,
    treatment.amountPaid,
    treatment.balance,
    treatment.remarks,
    treatment.createdAt,
    treatment.updatedAt
  ];
}

function buildTreatmentRow(treatment: NewTreatmentRecord): TreatmentRowRecord {
  return Object.fromEntries(
    treatmentInsertColumns.map((columnName, index) => [columnName, toTreatmentInsertValues(treatment)[index]])
  ) as TreatmentRowRecord;
}

class FakeTreatmentMigrationRunner implements PgTreatmentMigrationRunner {
  private readonly patientsById = new Map<string, PatientRowRecord>();
  private readonly patientMapsByCode = new Map<string, LegacyPatientIdentityMapRecord[]>();
  private readonly treatmentsById = new Map<string, TreatmentRowRecord>();
  private readonly treatmentIdsByCode = new Map<string, string>();
  private readonly legacyTreatmentMaps: LegacyTreatmentIdentityMapRecord[] = [];
  private readonly treatmentCounters = new Map<number, number>();

  failTreatmentInsert = false;
  failLegacyTreatmentMapInsert = false;
  transactionCalls = 0;

  get treatmentCount(): number {
    return this.treatmentsById.size;
  }

  get mappingCount(): number {
    return this.legacyTreatmentMaps.length;
  }

  seedMappedPatient(legacyPatientCode: string, patient: NewPatientRecord, legacyPatientRowId = 101): void {
    this.patientsById.set(patient.id, buildPatientRow(patient));
    const mappings = this.patientMapsByCode.get(legacyPatientCode) ?? [];
    mappings.push({
      sourceSystem: "sqlite-v1",
      legacyPatientRowId,
      legacyPatientCode,
      patientId: patient.id,
      createdAt: patient.createdAt
    });
    this.patientMapsByCode.set(legacyPatientCode, mappings);
  }

  seedConflictingPatientMappings(legacyPatientCode: string, patients: readonly NewPatientRecord[]): void {
    patients.forEach((patient, index) => {
      this.seedMappedPatient(legacyPatientCode, patient, 200 + index);
    });
  }

  seedTreatment(treatment: NewTreatmentRecord): void {
    this.storeTreatmentRow(buildTreatmentRow(treatment));
  }

  private storeTreatmentRow(row: TreatmentRowRecord): void {
    const treatmentId = String(row.id);
    const treatmentCode = String(row.treatment_code);
    this.treatmentsById.set(treatmentId, row);
    this.treatmentIdsByCode.set(treatmentCode, treatmentId);
  }

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<R>>;
  async query(text: string, values?: readonly unknown[]): Promise<QueryResult<QueryResultRow>> {
    const normalized = text.replace(/\s+/g, " ").trim();

    if (normalized.startsWith("INSERT INTO treatment_code_counters")) {
      const calendarYear = Number(values?.[0]);
      const nextSequence = (this.treatmentCounters.get(calendarYear) ?? 0) + 1;
      this.treatmentCounters.set(calendarYear, nextSequence);
      return buildResult<CounterRow>([{ last_sequence: nextSequence }]);
    }

    if (normalized.includes("FROM legacy_patient_identity_map m JOIN patients p ON p.id = m.patient_id")) {
      const sourceSystem = String(values?.[0]);
      const legacyPatientCode = String(values?.[1]);
      const mappings = (this.patientMapsByCode.get(legacyPatientCode) ?? [])
        .filter((mapping) => mapping.sourceSystem === sourceSystem)
        .map((mapping) => {
          const patientRow = this.patientsById.get(mapping.patientId);
          if (!patientRow) {
            throw new Error("Seeded legacy patient mapping points to a missing patient row.");
          }

          return {
            source_system: mapping.sourceSystem,
            legacy_patient_row_id: mapping.legacyPatientRowId,
            legacy_patient_code: mapping.legacyPatientCode,
            mapping_created_at: mapping.createdAt,
            ...patientRow
          };
        });

      return buildResult(mappings);
    }

    if (normalized.includes("FROM legacy_treatment_identity_map m JOIN treatments t ON t.id = m.treatment_id")) {
      const sourceSystem = String(values?.[0]);
      const legacyTreatmentRowId = Number(values?.[1]);
      const legacyTreatmentCode = String(values?.[2]);
      const rows = this.legacyTreatmentMaps
        .filter(
          (record) =>
            record.sourceSystem === sourceSystem &&
            (record.legacyTreatmentRowId === legacyTreatmentRowId || record.legacyTreatmentCode === legacyTreatmentCode)
        )
        .map((record) => {
          const treatmentRow = this.treatmentsById.get(record.treatmentId);
          if (!treatmentRow) {
            throw new Error("Seeded legacy treatment mapping points to a missing treatment row.");
          }

          return {
            source_system: record.sourceSystem,
            legacy_treatment_row_id: record.legacyTreatmentRowId,
            legacy_treatment_code: record.legacyTreatmentCode,
            mapping_created_at: record.createdAt,
            ...treatmentRow
          };
        });

      return buildResult(rows);
    }

    if (normalized === "SELECT * FROM treatments WHERE treatment_code = $1") {
      const treatmentCode = String(values?.[0]);
      const treatmentId = this.treatmentIdsByCode.get(treatmentCode);
      const row = treatmentId ? this.treatmentsById.get(treatmentId) : undefined;
      return buildResult(row ? [row] : []);
    }

    if (normalized.startsWith("INSERT INTO treatments (")) {
      if (this.failTreatmentInsert) {
        throw new Error("forced treatment insert failure");
      }

      const row = Object.fromEntries(
        treatmentInsertColumns.map((columnName, index) => [columnName, values?.[index] ?? null])
      ) as TreatmentRowRecord;
      const treatmentCode = String(row.treatment_code);
      if (this.treatmentIdsByCode.has(treatmentCode)) {
        throw new Error(`duplicate treatment_code ${treatmentCode}`);
      }

      this.storeTreatmentRow(row);
      return buildResult([row]);
    }

    if (normalized.startsWith("INSERT INTO legacy_treatment_identity_map")) {
      if (this.failLegacyTreatmentMapInsert) {
        throw new Error("forced legacy treatment map insert failure");
      }

      const record: LegacyTreatmentIdentityMapRecord = {
        sourceSystem: String(values?.[0]),
        legacyTreatmentRowId: Number(values?.[1]),
        legacyTreatmentCode: String(values?.[2]),
        treatmentId: String(values?.[3]),
        createdAt: String(values?.[4])
      };

      const hasConflict = this.legacyTreatmentMaps.some(
        (existing) =>
          (existing.sourceSystem === record.sourceSystem &&
            existing.legacyTreatmentRowId === record.legacyTreatmentRowId) ||
          (existing.sourceSystem === record.sourceSystem &&
            existing.legacyTreatmentCode === record.legacyTreatmentCode) ||
          existing.treatmentId === record.treatmentId
      );
      if (hasConflict) {
        throw new Error("duplicate legacy treatment map");
      }

      this.legacyTreatmentMaps.push(record);
      return buildResult([]);
    }

    throw new Error(`Unexpected SQL in FakeTreatmentMigrationRunner: ${normalized}`);
  }

  async withTransaction<T>(callback: (executor: PgQueryExecutor) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    const treatmentSnapshot = structuredClone([...this.treatmentsById.entries()]);
    const treatmentCodeSnapshot = structuredClone([...this.treatmentIdsByCode.entries()]);
    const legacyMapSnapshot = structuredClone(this.legacyTreatmentMaps);
    const counterSnapshot = structuredClone([...this.treatmentCounters.entries()]);

    try {
      return await callback(this);
    } catch (error) {
      this.treatmentsById.clear();
      treatmentSnapshot.forEach(([key, value]) => this.treatmentsById.set(key, value));

      this.treatmentIdsByCode.clear();
      treatmentCodeSnapshot.forEach(([key, value]) => this.treatmentIdsByCode.set(key, value));

      this.legacyTreatmentMaps.length = 0;
      legacyMapSnapshot.forEach((record) => this.legacyTreatmentMaps.push(record));

      this.treatmentCounters.clear();
      counterSnapshot.forEach(([key, value]) => this.treatmentCounters.set(key, value));

      throw error;
    }
  }
}

async function seedMappedPatient(
  runner: FakeTreatmentMigrationRunner,
  overrides: Partial<LegacyTreatmentRow> = {},
  branchMappings: readonly BranchLocationMapping[] = fictionalBranchMappings
): Promise<{ legacyTreatment: LegacyTreatmentRow; patient: NewPatientRecord }> {
  const legacyPatient = buildFictionalLegacyPatientRow({
    patient_id: overrides.patient_id ?? "P-2026-0007"
  });
  const mappedPatient = mapLegacyPatientToDraft(legacyPatient, branchMappings);
  runner.seedMappedPatient(legacyPatient.patient_id, mappedPatient.patient, legacyPatient.id);

  return {
    legacyTreatment: buildFictionalLegacyTreatmentRow(overrides),
    patient: mappedPatient.patient
  };
}

test("formatTreatmentCode preserves the visible V1 treatment identifier format", () => {
  assert.equal(formatTreatmentCode(2026, 7), "T-2026-0007");
});

test("getTreatmentCodeCalendarYear uses the clinic timezone at New Year boundaries", () => {
  assert.equal(getTreatmentCodeCalendarYear(new Date("2025-12-31T15:30:00.000Z"), "Asia/Manila"), 2025);
  assert.equal(getTreatmentCodeCalendarYear(new Date("2025-12-31T16:30:00.000Z"), "Asia/Manila"), 2026);
});

test("allocateAnnualTreatmentCode increments per year and resets across years", async () => {
  const runner = new FakeTreatmentMigrationRunner();

  const first = await allocateAnnualTreatmentCode(runner, new Date("2026-08-17T12:00:00.000Z"));
  const second = await allocateAnnualTreatmentCode(runner, new Date("2026-08-17T12:01:00.000Z"));
  const nextYear = await allocateAnnualTreatmentCode(runner, new Date("2027-01-01T00:00:00.000Z"));

  assert.deepEqual(first, {
    calendarYear: 2026,
    sequence: 1,
    treatmentCode: "T-2026-0001"
  });
  assert.equal(second.treatmentCode, "T-2026-0002");
  assert.equal(nextYear.treatmentCode, "T-2027-0001");
});

test("mapLegacyTreatmentToDraft preserves V1 treatment parity and patient UUID linkage", async () => {
  const runner = new FakeTreatmentMigrationRunner();
  const { legacyTreatment, patient } = await seedMappedPatient(runner);

  const mapped = await mapLegacyTreatmentToDraft(runner, legacyTreatment, "55555555-5555-4555-8555-555555555555");

  assert.equal(mapped.treatment.id, "55555555-5555-4555-8555-555555555555");
  assert.equal(mapped.treatment.treatmentCode, legacyTreatment.treatment_id);
  assert.equal(mapped.treatment.patientId, patient.id);
  assert.equal(mapped.treatment.nextAppointmentDate, legacyTreatment.next_appointment_date);
  assert.equal(mapped.treatment.nextAppointmentTime, legacyTreatment.next_appointment_time);
  assert.equal(mapped.treatment.discountType, "PWD");
  assert.equal(mapped.treatment.amountCharged, 1500);
  assert.equal(mapped.treatment.discountPercent, 20);
  assert.equal(mapped.treatment.discountAmount, 300);
  assert.equal(mapped.treatment.netAmountDue, 1200);
  assert.equal(mapped.treatment.amountPaid, 500);
  assert.equal(mapped.treatment.balance, 700);
  assert.equal(mapped.legacyIdentityMap.legacyTreatmentRowId, legacyTreatment.id);
  assert.equal(mapped.legacyIdentityMap.legacyTreatmentCode, legacyTreatment.treatment_id);
});

test("mapLegacyTreatmentToDraft normalizes legacy blanks and fallback next appointment date safely", async () => {
  const runner = new FakeTreatmentMigrationRunner();
  const { legacyTreatment } = await seedMappedPatient(runner, {
    tooth_numbers: "   ",
    next_appointment: "2026-08-28",
    next_appointment_date: "   ",
    next_appointment_time: "   ",
    discount_type: "   ",
    discount_percent: null,
    discount_amount: null,
    net_amount_due: null,
    balance: null,
    remarks: "   "
  });

  const mapped = await mapLegacyTreatmentToDraft(runner, legacyTreatment);

  assert.equal(mapped.treatment.toothNumbers, null);
  assert.equal(mapped.treatment.nextAppointmentDate, "2026-08-28");
  assert.equal(mapped.treatment.nextAppointmentTime, null);
  assert.equal(mapped.treatment.discountType, "None");
  assert.equal(mapped.treatment.discountPercent, 0);
  assert.equal(mapped.treatment.discountAmount, 0);
  assert.equal(mapped.treatment.netAmountDue, 1500);
  assert.equal(mapped.treatment.balance, 1000);
  assert.equal(mapped.treatment.remarks, null);
});

test("mapLegacyTreatmentToDraft rejects malformed non-ISO timestamps", async () => {
  const runner = new FakeTreatmentMigrationRunner();
  const { legacyTreatment } = await seedMappedPatient(runner, {
    created_at: "08/10/2026 08:30 AM"
  });

  await assert.rejects(
    async () => mapLegacyTreatmentToDraft(runner, legacyTreatment),
    /Legacy treatment created_at must be an ISO timestamp/
  );
});

test("migrateLegacyTreatment writes Treatment and legacy identity map atomically and reuses reruns", async () => {
  const runner = new FakeTreatmentMigrationRunner();
  const { legacyTreatment } = await seedMappedPatient(runner);

  const migrated = await migrateLegacyTreatment(runner, legacyTreatment);
  const rerun = await migrateLegacyTreatment(runner, legacyTreatment);

  assert.equal(migrated.reusedExisting, false);
  assert.equal(rerun.reusedExisting, true);
  assert.equal(runner.treatmentCount, 1);
  assert.equal(runner.mappingCount, 1);
  assert.equal(rerun.treatment.id, migrated.treatment.id);
  assert.equal(runner.transactionCalls, 2);
});

test("migrateLegacyTreatment fails before write when no V2 patient mapping exists", async () => {
  const runner = new FakeTreatmentMigrationRunner();

  await assert.rejects(
    async () => migrateLegacyTreatment(runner, buildFictionalLegacyTreatmentRow()),
    /No migrated V2 patient mapping exists/
  );
  assert.equal(runner.treatmentCount, 0);
  assert.equal(runner.mappingCount, 0);
});

test("migrateLegacyTreatment fails clearly on conflicting V2 patient mappings", async () => {
  const runner = new FakeTreatmentMigrationRunner();
  const legacyPatient = buildFictionalLegacyPatientRow();
  const mappedPatient = mapLegacyPatientToDraft(legacyPatient, fictionalBranchMappings);
  const conflictingPatient = mapLegacyPatientToDraft(legacyPatient, fictionalBranchMappings, "66666666-6666-4666-8666-666666666666");

  runner.seedConflictingPatientMappings(legacyPatient.patient_id, [mappedPatient.patient, conflictingPatient.patient]);

  await assert.rejects(
    async () => migrateLegacyTreatment(runner, buildFictionalLegacyTreatmentRow()),
    /Conflicting V2 patient mappings exist/
  );
  assert.equal(runner.treatmentCount, 0);
});

test("migrateLegacyTreatment rolls back cleanly when Treatment insertion fails", async () => {
  const runner = new FakeTreatmentMigrationRunner();
  const { legacyTreatment } = await seedMappedPatient(runner);
  runner.failTreatmentInsert = true;

  await assert.rejects(
    async () => migrateLegacyTreatment(runner, legacyTreatment),
    /forced treatment insert failure/
  );

  assert.equal(runner.treatmentCount, 0);
  assert.equal(runner.mappingCount, 0);
});

test("migrateLegacyTreatment rolls back the Treatment row when legacy identity-map insertion fails", async () => {
  const runner = new FakeTreatmentMigrationRunner();
  const { legacyTreatment } = await seedMappedPatient(runner);
  runner.failLegacyTreatmentMapInsert = true;

  await assert.rejects(
    async () => migrateLegacyTreatment(runner, legacyTreatment),
    /forced legacy treatment map insert failure/
  );

  assert.equal(runner.treatmentCount, 0);
  assert.equal(runner.mappingCount, 0);
});

test("migrateLegacyTreatment rejects treatment-code conflicts without a matching legacy identity map", async () => {
  const runner = new FakeTreatmentMigrationRunner();
  const { legacyTreatment } = await seedMappedPatient(runner);
  const mapped = await mapLegacyTreatmentToDraft(runner, legacyTreatment, "77777777-7777-4777-8777-777777777777");
  runner.seedTreatment(mapped.treatment);

  await assert.rejects(
    async () => migrateLegacyTreatment(runner, legacyTreatment),
    /Treatment code conflict/
  );
  assert.equal(runner.mappingCount, 0);
});

test("migrateLegacyTreatment rejects conflicting existing migrated parity states", async () => {
  const runner = new FakeTreatmentMigrationRunner();
  const { legacyTreatment } = await seedMappedPatient(runner);
  const mapped = await mapLegacyTreatmentToDraft(runner, legacyTreatment, "88888888-8888-4888-8888-888888888888");
  const mutatedTreatment: NewTreatmentRecord = {
    ...mapped.treatment,
    remarks: "Different persisted remark"
  };

  runner.seedTreatment(mutatedTreatment);
  await runner.query(
    `INSERT INTO legacy_treatment_identity_map
       (source_system, legacy_treatment_row_id, legacy_treatment_code, treatment_id, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      mapped.legacyIdentityMap.sourceSystem,
      mapped.legacyIdentityMap.legacyTreatmentRowId,
      mapped.legacyIdentityMap.legacyTreatmentCode,
      mapped.legacyIdentityMap.treatmentId,
      mapped.legacyIdentityMap.createdAt
    ]
  );

  await assert.rejects(
    async () => migrateLegacyTreatment(runner, legacyTreatment),
    /expected Batch B parity state/
  );
});
