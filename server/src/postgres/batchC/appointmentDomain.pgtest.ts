import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import { buildFictionalLegacyPatientRow, fictionalBranchMappings } from "../batchA/patientFixtures.js";
import { mapLegacyPatientToDraft } from "../batchA/patientMigration.js";
import { patientInsertColumns, type LegacyPatientIdentityMapRecord, type NewPatientRecord } from "../batchA/patients.js";
import type { PgQueryExecutor } from "../pool.js";
import { buildFictionalLegacyAppointmentRow } from "./appointmentFixtures.js";
import {
  mapLegacyAppointmentToDraft,
  migrateLegacyAppointment,
  type LegacyAppointmentRow,
  type PgAppointmentMigrationRunner
} from "./appointmentMigration.js";
import {
  appointmentInsertColumns,
  type LegacyAppointmentIdentityMapRecord,
  type NewAppointmentRecord
} from "./appointments.js";

type PatientRowRecord = Record<(typeof patientInsertColumns)[number], unknown>;
type AppointmentRowRecord = Record<(typeof appointmentInsertColumns)[number], unknown>;

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

function toAppointmentInsertValues(appointment: NewAppointmentRecord): readonly unknown[] {
  return [
    appointment.id,
    appointment.patientId,
    appointment.branchId,
    appointment.appointmentDate,
    appointment.appointmentTime,
    appointment.plannedProcedure,
    appointment.notes,
    appointment.status,
    appointment.createdAt,
    appointment.updatedAt
  ];
}

function buildAppointmentRow(appointment: NewAppointmentRecord): AppointmentRowRecord {
  return Object.fromEntries(
    appointmentInsertColumns.map((columnName, index) => [columnName, toAppointmentInsertValues(appointment)[index]])
  ) as AppointmentRowRecord;
}

class FakeAppointmentMigrationRunner implements PgAppointmentMigrationRunner {
  private readonly patientsById = new Map<string, PatientRowRecord>();
  private readonly patientMapsByCode = new Map<string, LegacyPatientIdentityMapRecord[]>();
  private readonly appointmentsById = new Map<string, AppointmentRowRecord>();
  private readonly legacyAppointmentMaps: LegacyAppointmentIdentityMapRecord[] = [];

  failAppointmentInsert = false;
  failLegacyMapInsert = false;
  transactionCalls = 0;

  get appointmentCount(): number {
    return this.appointmentsById.size;
  }

  get mappingCount(): number {
    return this.legacyAppointmentMaps.length;
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

  seedPatientWithInvalidBranch(legacyPatientCode: string, patient: NewPatientRecord): void {
    const invalidPatient: NewPatientRecord = {
      ...patient,
      branchId: ""
    };
    this.seedMappedPatient(legacyPatientCode, invalidPatient);
  }

  seedAppointment(appointment: NewAppointmentRecord): void {
    this.storeAppointmentRow(buildAppointmentRow(appointment));
  }

  private storeAppointmentRow(row: AppointmentRowRecord): void {
    this.appointmentsById.set(String(row.id), row);
  }

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<R>>;
  async query(text: string, values?: readonly unknown[]): Promise<QueryResult<QueryResultRow>> {
    const normalized = text.replace(/\s+/g, " ").trim();

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

    if (normalized.includes("FROM legacy_appointment_identity_map m JOIN appointments a ON a.id = m.appointment_id")) {
      const sourceSystem = String(values?.[0]);
      const legacyAppointmentRowId = Number(values?.[1]);
      const rows = this.legacyAppointmentMaps
        .filter(
          (record) =>
            record.sourceSystem === sourceSystem && record.legacyAppointmentRowId === legacyAppointmentRowId
        )
        .map((record) => {
          const appointmentRow = this.appointmentsById.get(record.appointmentId);
          if (!appointmentRow) {
            throw new Error("Seeded legacy appointment mapping points to a missing appointment row.");
          }

          return {
            source_system: record.sourceSystem,
            legacy_appointment_row_id: record.legacyAppointmentRowId,
            mapping_created_at: record.createdAt,
            ...appointmentRow
          };
        });

      return buildResult(rows);
    }

    if (normalized.startsWith("INSERT INTO appointments (")) {
      if (this.failAppointmentInsert) {
        throw new Error("forced appointment insert failure");
      }

      const row = Object.fromEntries(
        appointmentInsertColumns.map((columnName, index) => [columnName, values?.[index] ?? null])
      ) as AppointmentRowRecord;
      this.storeAppointmentRow(row);
      return buildResult([row]);
    }

    if (normalized.startsWith("INSERT INTO legacy_appointment_identity_map")) {
      if (this.failLegacyMapInsert) {
        throw new Error("forced legacy appointment map insert failure");
      }

      const record: LegacyAppointmentIdentityMapRecord = {
        sourceSystem: String(values?.[0]),
        legacyAppointmentRowId: Number(values?.[1]),
        appointmentId: String(values?.[2]),
        createdAt: String(values?.[3])
      };

      const hasConflict = this.legacyAppointmentMaps.some(
        (existing) =>
          (existing.sourceSystem === record.sourceSystem &&
            existing.legacyAppointmentRowId === record.legacyAppointmentRowId) ||
          existing.appointmentId === record.appointmentId
      );
      if (hasConflict) {
        throw new Error("duplicate legacy appointment map");
      }

      this.legacyAppointmentMaps.push(record);
      return buildResult([]);
    }

    throw new Error(`Unexpected SQL in FakeAppointmentMigrationRunner: ${normalized}`);
  }

  async withTransaction<T>(callback: (executor: PgQueryExecutor) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    const appointmentSnapshot = structuredClone([...this.appointmentsById.entries()]);
    const mapSnapshot = structuredClone(this.legacyAppointmentMaps);

    try {
      return await callback(this);
    } catch (error) {
      this.appointmentsById.clear();
      appointmentSnapshot.forEach(([key, value]) => this.appointmentsById.set(key, value));

      this.legacyAppointmentMaps.length = 0;
      mapSnapshot.forEach((record) => this.legacyAppointmentMaps.push(record));

      throw error;
    }
  }
}

async function seedMappedPatient(
  runner: FakeAppointmentMigrationRunner,
  overrides: Partial<LegacyAppointmentRow> = {}
): Promise<{ legacyAppointment: LegacyAppointmentRow; patient: NewPatientRecord }> {
  const legacyPatient = buildFictionalLegacyPatientRow({
    patient_id: overrides.patient_id ?? "P-2026-0007"
  });
  const mappedPatient = mapLegacyPatientToDraft(legacyPatient, fictionalBranchMappings);
  runner.seedMappedPatient(legacyPatient.patient_id, mappedPatient.patient, legacyPatient.id);

  return {
    legacyAppointment: buildFictionalLegacyAppointmentRow(overrides),
    patient: mappedPatient.patient
  };
}

test("mapLegacyAppointmentToDraft preserves full V1 appointment parity and patient branch snapshot", async () => {
  const runner = new FakeAppointmentMigrationRunner();
  const { legacyAppointment, patient } = await seedMappedPatient(runner);

  const mapped = await mapLegacyAppointmentToDraft(
    runner,
    legacyAppointment,
    "99999999-9999-4999-8999-999999999999"
  );

  assert.deepEqual(mapped.appointment, {
    id: "99999999-9999-4999-8999-999999999999",
    patientId: patient.id,
    branchId: patient.branchId,
    appointmentDate: legacyAppointment.appointment_date,
    appointmentTime: legacyAppointment.appointment_time,
    plannedProcedure: legacyAppointment.planned_procedure,
    notes: legacyAppointment.notes,
    status: "confirmed",
    createdAt: legacyAppointment.created_at,
    updatedAt: legacyAppointment.updated_at
  });
  assert.equal(mapped.legacyIdentityMap.legacyAppointmentRowId, legacyAppointment.id);
});

test("mapLegacyAppointmentToDraft normalizes blanks to NULL and keeps optional appointment_time NULL", async () => {
  const runner = new FakeAppointmentMigrationRunner();
  const { legacyAppointment } = await seedMappedPatient(runner, {
    appointment_time: "   ",
    planned_procedure: "   ",
    notes: "   ",
    status: "   "
  });

  const mapped = await mapLegacyAppointmentToDraft(runner, legacyAppointment);

  assert.equal(mapped.appointment.appointmentTime, null);
  assert.equal(mapped.appointment.plannedProcedure, null);
  assert.equal(mapped.appointment.notes, null);
  assert.equal(mapped.appointment.status, "confirmed");
});

test("mapLegacyAppointmentToDraft accepts JS ISO timestamps and SQLite CURRENT_TIMESTAMP form", async () => {
  const runner = new FakeAppointmentMigrationRunner();
  const { legacyAppointment } = await seedMappedPatient(runner, {
    created_at: "2026-08-20 08:00:00",
    updated_at: "2026-08-20T08:30:00.000Z"
  });

  const mapped = await mapLegacyAppointmentToDraft(runner, legacyAppointment);

  assert.equal(mapped.appointment.createdAt, "2026-08-20T08:00:00.000Z");
  assert.equal(mapped.appointment.updatedAt, "2026-08-20T08:30:00.000Z");
});

test("mapLegacyAppointmentToDraft rejects malformed timestamps", async () => {
  const runner = new FakeAppointmentMigrationRunner();
  const { legacyAppointment } = await seedMappedPatient(runner, {
    created_at: "08/20/2026 08:00 AM"
  });

  await assert.rejects(
    async () => mapLegacyAppointmentToDraft(runner, legacyAppointment),
    /supported legacy appointment timestamp format/
  );
});

test("migrateLegacyAppointment is atomic and rerun-safe", async () => {
  const runner = new FakeAppointmentMigrationRunner();
  const { legacyAppointment } = await seedMappedPatient(runner);

  const migrated = await migrateLegacyAppointment(runner, legacyAppointment);
  const rerun = await migrateLegacyAppointment(runner, legacyAppointment);

  assert.equal(migrated.reusedExisting, false);
  assert.equal(rerun.reusedExisting, true);
  assert.equal(runner.appointmentCount, 1);
  assert.equal(runner.mappingCount, 1);
  assert.equal(rerun.appointment.id, migrated.appointment.id);
});

test("duplicate-equivalent legacy appointment rows both migrate and rerun independently", async () => {
  const runner = new FakeAppointmentMigrationRunner();
  const { patient } = await seedMappedPatient(runner);
  const firstLegacy = buildFictionalLegacyAppointmentRow({
    id: 901,
    patient_id: "P-2026-0007"
  });
  const secondLegacy = buildFictionalLegacyAppointmentRow({
    id: 902,
    patient_id: "P-2026-0007"
  });

  const firstMigrated = await migrateLegacyAppointment(runner, firstLegacy);
  const secondMigrated = await migrateLegacyAppointment(runner, secondLegacy);
  const firstRerun = await migrateLegacyAppointment(runner, firstLegacy);
  const secondRerun = await migrateLegacyAppointment(runner, secondLegacy);

  assert.equal(firstMigrated.appointment.patientId, patient.id);
  assert.equal(secondMigrated.appointment.patientId, patient.id);
  assert.notEqual(firstMigrated.appointment.id, secondMigrated.appointment.id);
  assert.equal(runner.appointmentCount, 2);
  assert.equal(runner.mappingCount, 2);
  assert.equal(firstRerun.reusedExisting, true);
  assert.equal(secondRerun.reusedExisting, true);
  assert.equal(firstRerun.appointment.id, firstMigrated.appointment.id);
  assert.equal(secondRerun.appointment.id, secondMigrated.appointment.id);
  assert.equal(runner.appointmentCount, 2);
  assert.equal(runner.mappingCount, 2);
});

test("migrateLegacyAppointment fails before write when patient mapping is missing", async () => {
  const runner = new FakeAppointmentMigrationRunner();

  await assert.rejects(
    async () => migrateLegacyAppointment(runner, buildFictionalLegacyAppointmentRow()),
    /No migrated V2 patient mapping exists/
  );
  assert.equal(runner.appointmentCount, 0);
  assert.equal(runner.mappingCount, 0);
});

test("migrateLegacyAppointment fails clearly on conflicting patient mappings", async () => {
  const runner = new FakeAppointmentMigrationRunner();
  const legacyPatient = buildFictionalLegacyPatientRow();
  const mappedPatient = mapLegacyPatientToDraft(legacyPatient, fictionalBranchMappings);
  const conflictingPatient = mapLegacyPatientToDraft(
    legacyPatient,
    fictionalBranchMappings,
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  );
  runner.seedConflictingPatientMappings(legacyPatient.patient_id, [
    mappedPatient.patient,
    conflictingPatient.patient
  ]);

  await assert.rejects(
    async () => migrateLegacyAppointment(runner, buildFictionalLegacyAppointmentRow()),
    /Conflicting V2 patient mappings exist/
  );
});

test("migrateLegacyAppointment fails safely when mapped patient has no valid branch relationship", async () => {
  const runner = new FakeAppointmentMigrationRunner();
  const legacyPatient = buildFictionalLegacyPatientRow();
  const mappedPatient = mapLegacyPatientToDraft(legacyPatient, fictionalBranchMappings);
  runner.seedPatientWithInvalidBranch(legacyPatient.patient_id, mappedPatient.patient);

  await assert.rejects(
    async () => migrateLegacyAppointment(runner, buildFictionalLegacyAppointmentRow()),
    /does not have a valid branch relationship/
  );
  assert.equal(runner.appointmentCount, 0);
});

test("migrateLegacyAppointment rolls back cleanly when appointment insert fails", async () => {
  const runner = new FakeAppointmentMigrationRunner();
  const { legacyAppointment } = await seedMappedPatient(runner);
  runner.failAppointmentInsert = true;

  await assert.rejects(
    async () => migrateLegacyAppointment(runner, legacyAppointment),
    /forced appointment insert failure/
  );
  assert.equal(runner.appointmentCount, 0);
  assert.equal(runner.mappingCount, 0);
});

test("migrateLegacyAppointment rolls back cleanly when legacy map insert fails", async () => {
  const runner = new FakeAppointmentMigrationRunner();
  const { legacyAppointment } = await seedMappedPatient(runner);
  runner.failLegacyMapInsert = true;

  await assert.rejects(
    async () => migrateLegacyAppointment(runner, legacyAppointment),
    /forced legacy appointment map insert failure/
  );
  assert.equal(runner.appointmentCount, 0);
  assert.equal(runner.mappingCount, 0);
});

test("migrateLegacyAppointment rejects conflicting existing parity state", async () => {
  const runner = new FakeAppointmentMigrationRunner();
  const { legacyAppointment } = await seedMappedPatient(runner);
  const mapped = await mapLegacyAppointmentToDraft(
    runner,
    legacyAppointment,
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  );
  runner.seedAppointment({
    ...mapped.appointment,
    notes: "Different persisted note"
  });
  await runner.query(
    `INSERT INTO legacy_appointment_identity_map
       (source_system, legacy_appointment_row_id, appointment_id, created_at)
     VALUES ($1, $2, $3, $4)`,
    [
      mapped.legacyIdentityMap.sourceSystem,
      mapped.legacyIdentityMap.legacyAppointmentRowId,
      mapped.legacyIdentityMap.appointmentId,
      mapped.legacyIdentityMap.createdAt
    ]
  );

  await assert.rejects(
    async () => migrateLegacyAppointment(runner, legacyAppointment),
    /expected Batch C parity state/
  );
});
