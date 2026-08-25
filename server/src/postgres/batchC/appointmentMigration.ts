import crypto from "node:crypto";
import { listLegacyPatientMigrationStatesByCode } from "../batchA/patients.js";
import type { PgPoolManager, PgQueryExecutor } from "../pool.js";
import {
  insertAppointment,
  insertLegacyAppointmentIdentityMap,
  listLegacyAppointmentMigrationStates,
  type AppointmentStatus,
  type LegacyAppointmentIdentityMapRecord,
  type LegacyAppointmentMigrationState,
  type NewAppointmentRecord
} from "./appointments.js";

export interface LegacyAppointmentRow {
  id: number;
  patient_id: string;
  appointment_date: string;
  appointment_time: string | null;
  planned_procedure: string | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface MappedAppointmentDraft {
  appointment: NewAppointmentRecord;
  legacyIdentityMap: LegacyAppointmentIdentityMapRecord;
}

export interface MigratedLegacyAppointmentResult extends MappedAppointmentDraft {
  reusedExisting: boolean;
}

export type PgAppointmentMigrationRunner = PgQueryExecutor &
  Pick<PgPoolManager, "withTransaction">;

const allowedStatuses = new Set<AppointmentStatus>([
  "Scheduled",
  "Completed",
  "Cancelled",
  "No-show"
]);

interface ResolvedPatientSnapshot {
  patientId: string;
  branchId: string;
}

function assertIsoDate(value: string, label: string): string {
  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }

  return normalized;
}

function assertTimeString(value: string, label: string): string {
  const normalized = String(value).trim();
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(normalized)) {
    throw new Error(`${label} must use HH:MM 24-hour format.`);
  }

  return normalized;
}

function normalizeRequiredString(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeAppointmentStatus(value: string | null): AppointmentStatus {
  const normalized = normalizeOptionalString(value) ?? "Scheduled";
  if (!allowedStatuses.has(normalized as AppointmentStatus)) {
    throw new Error(`Legacy appointment status is invalid: ${normalized}.`);
  }

  return normalized as AppointmentStatus;
}

function normalizeLegacyTimestamp(value: string, label: string): string {
  const normalized = String(value).trim();
  const isoTimestampPattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (isoTimestampPattern.test(normalized)) {
    if (Number.isNaN(Date.parse(normalized))) {
      throw new Error(`${label} must be a valid legacy appointment timestamp.`);
    }
    return normalized;
  }

  const sqliteTimestampPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  if (sqliteTimestampPattern.test(normalized)) {
    const isoNormalized = normalized.replace(" ", "T") + ".000Z";
    if (Number.isNaN(Date.parse(isoNormalized))) {
      throw new Error(`${label} must be a valid legacy appointment timestamp.`);
    }
    return isoNormalized;
  }

  throw new Error(
    `${label} must use a supported legacy appointment timestamp format (ISO 8601 or SQLite CURRENT_TIMESTAMP form).`
  );
}

async function resolveMappedPatientSnapshot(
  executor: PgQueryExecutor,
  legacyPatientCode: string
): Promise<ResolvedPatientSnapshot> {
  const states = await listLegacyPatientMigrationStatesByCode(executor, "sqlite-v1", legacyPatientCode);

  if (states.length === 0) {
    throw new Error(`No migrated V2 patient mapping exists for legacy patient code ${legacyPatientCode}.`);
  }

  if (states.length > 1) {
    throw new Error(`Conflicting V2 patient mappings exist for legacy patient code ${legacyPatientCode}.`);
  }

  const patient = states[0].patient;
  if (!String(patient.branchId || "").trim()) {
    throw new Error(`Migrated V2 patient ${patient.id} does not have a valid branch relationship.`);
  }

  return {
    patientId: patient.id,
    branchId: patient.branchId
  };
}

export async function mapLegacyAppointmentToDraft(
  executor: PgQueryExecutor,
  legacyAppointment: LegacyAppointmentRow,
  appointmentId: string = crypto.randomUUID()
): Promise<MappedAppointmentDraft> {
  const patientCode = normalizeRequiredString(legacyAppointment.patient_id, "Legacy appointment patient_id");
  const patientSnapshot = await resolveMappedPatientSnapshot(executor, patientCode);
  const createdAt = normalizeLegacyTimestamp(legacyAppointment.created_at, "Legacy appointment created_at");
  const updatedAt = normalizeLegacyTimestamp(legacyAppointment.updated_at, "Legacy appointment updated_at");

  return {
    appointment: {
      id: appointmentId,
      patientId: patientSnapshot.patientId,
      branchId: patientSnapshot.branchId,
      appointmentDate: assertIsoDate(legacyAppointment.appointment_date, "Legacy appointment appointment_date"),
      appointmentTime: normalizeOptionalString(legacyAppointment.appointment_time)
        ? assertTimeString(String(legacyAppointment.appointment_time), "Legacy appointment appointment_time")
        : null,
      plannedProcedure: normalizeOptionalString(legacyAppointment.planned_procedure),
      notes: normalizeOptionalString(legacyAppointment.notes),
      status: normalizeAppointmentStatus(legacyAppointment.status),
      createdAt,
      updatedAt
    },
    legacyIdentityMap: {
      sourceSystem: "sqlite-v1",
      legacyAppointmentRowId: legacyAppointment.id,
      appointmentId,
      createdAt
    }
  };
}

function findAppointmentDifference(existing: NewAppointmentRecord, expected: NewAppointmentRecord): string | null {
  for (const [key, expectedValue] of Object.entries(expected) as [
    keyof NewAppointmentRecord,
    NewAppointmentRecord[keyof NewAppointmentRecord]
  ][]) {
    if (existing[key] !== expectedValue) {
      return `${String(key)} expected ${JSON.stringify(expectedValue)} but found ${JSON.stringify(existing[key])}`;
    }
  }

  return null;
}

function buildPersistedMigrationResult(
  existingState: LegacyAppointmentMigrationState
): MigratedLegacyAppointmentResult {
  return {
    appointment: existingState.appointment,
    legacyIdentityMap: {
      sourceSystem: existingState.sourceSystem,
      legacyAppointmentRowId: existingState.legacyAppointmentRowId,
      appointmentId: existingState.appointment.id,
      createdAt: existingState.mappingCreatedAt
    },
    reusedExisting: true
  };
}

function assertMatchingExistingMigration(
  existingState: LegacyAppointmentMigrationState,
  expectedDraft: MappedAppointmentDraft
): void {
  if (existingState.legacyAppointmentRowId !== expectedDraft.legacyIdentityMap.legacyAppointmentRowId) {
    throw new Error(
      "Existing legacy appointment mapping row id does not match the requested migration row id."
    );
  }

  const difference = findAppointmentDifference(existingState.appointment, expectedDraft.appointment);
  if (difference) {
    throw new Error(
      `Existing migrated appointment does not match the expected Batch C parity state: ${difference}.`
    );
  }
}

export async function migrateLegacyAppointment(
  runner: PgAppointmentMigrationRunner,
  legacyAppointment: LegacyAppointmentRow
): Promise<MigratedLegacyAppointmentResult> {
  return runner.withTransaction(async (executor) => {
    const patientCode = normalizeRequiredString(legacyAppointment.patient_id, "Legacy appointment patient_id");
    await resolveMappedPatientSnapshot(executor, patientCode);

    const existingStates = await listLegacyAppointmentMigrationStates(
      executor,
      "sqlite-v1",
      legacyAppointment.id
    );

    if (existingStates.length > 1) {
      throw new Error(
        "Conflicting legacy appointment migration rows already exist for the same legacy identity key."
      );
    }

    const existingState = existingStates[0];
    if (existingState) {
      const expectedDraft = await mapLegacyAppointmentToDraft(executor, legacyAppointment, existingState.appointment.id);
      assertMatchingExistingMigration(existingState, expectedDraft);
      return buildPersistedMigrationResult(existingState);
    }

    const mappedDraft = await mapLegacyAppointmentToDraft(executor, legacyAppointment);
    const insertedAppointment = await insertAppointment(executor, mappedDraft.appointment);
    await insertLegacyAppointmentIdentityMap(executor, mappedDraft.legacyIdentityMap);

    return {
      appointment: insertedAppointment,
      legacyIdentityMap: mappedDraft.legacyIdentityMap,
      reusedExisting: false
    };
  });
}
