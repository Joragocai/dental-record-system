import type { QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../pool.js";

export type AppointmentStatus = "Scheduled" | "Completed" | "Cancelled" | "No-show";

export interface NewAppointmentRecord {
  id: string;
  patientId: string;
  branchId: string;
  appointmentDate: string;
  appointmentTime: string | null;
  plannedProcedure: string | null;
  notes: string | null;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyAppointmentIdentityMapRecord {
  sourceSystem: string;
  legacyAppointmentRowId: number;
  appointmentId: string;
  createdAt: string;
}

export interface LegacyAppointmentMigrationState {
  sourceSystem: string;
  legacyAppointmentRowId: number;
  mappingCreatedAt: string;
  appointment: NewAppointmentRecord;
}

interface AppointmentRow extends QueryResultRow {
  id: string;
  patient_id: string;
  branch_id: string;
  appointment_date: string;
  appointment_time: string | null;
  planned_procedure: string | null;
  notes: string | null;
  status: AppointmentStatus;
  created_at: string | Date;
  updated_at: string | Date;
}

interface LegacyAppointmentMigrationRow extends AppointmentRow {
  source_system: string;
  legacy_appointment_row_id: number | string;
  mapping_created_at: string | Date;
}

export const appointmentInsertColumns = [
  "id",
  "patient_id",
  "branch_id",
  "appointment_date",
  "appointment_time",
  "planned_procedure",
  "notes",
  "status",
  "created_at",
  "updated_at"
] as const;

function toIsoTimestamp(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function normalizeAppointmentTime(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = String(value);
  const match = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/);
  if (!match) {
    return normalized;
  }

  return `${match[1]}:${match[2]}`;
}

export function mapAppointmentRow(row: AppointmentRow): NewAppointmentRecord {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    branchId: String(row.branch_id),
    appointmentDate: String(row.appointment_date),
    appointmentTime: normalizeAppointmentTime(row.appointment_time === null ? null : String(row.appointment_time)),
    plannedProcedure: row.planned_procedure === null ? null : String(row.planned_procedure),
    notes: row.notes === null ? null : String(row.notes),
    status: row.status,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at)
  };
}

function mapLegacyAppointmentMigrationRow(
  row: LegacyAppointmentMigrationRow
): LegacyAppointmentMigrationState {
  return {
    sourceSystem: String(row.source_system),
    legacyAppointmentRowId: Number(row.legacy_appointment_row_id),
    mappingCreatedAt: toIsoTimestamp(row.mapping_created_at),
    appointment: mapAppointmentRow(row)
  };
}

function buildAppointmentInsertValues(appointment: NewAppointmentRecord): readonly unknown[] {
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

export async function insertAppointment(
  executor: PgQueryExecutor,
  appointment: NewAppointmentRecord
): Promise<NewAppointmentRecord> {
  const placeholders = appointmentInsertColumns.map((_, index) => `$${index + 1}`).join(", ");
  const result = await executor.query<AppointmentRow>(
    `INSERT INTO appointments (${appointmentInsertColumns.join(", ")})
     VALUES (${placeholders})
     RETURNING *`,
    buildAppointmentInsertValues(appointment)
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Appointment insert did not return a row.");
  }

  return mapAppointmentRow(row);
}

export async function insertLegacyAppointmentIdentityMap(
  executor: PgQueryExecutor,
  record: LegacyAppointmentIdentityMapRecord
): Promise<LegacyAppointmentIdentityMapRecord> {
  await executor.query(
    `INSERT INTO legacy_appointment_identity_map
       (source_system, legacy_appointment_row_id, appointment_id, created_at)
     VALUES ($1, $2, $3, $4)`,
    [record.sourceSystem, record.legacyAppointmentRowId, record.appointmentId, record.createdAt]
  );

  return record;
}

export async function listLegacyAppointmentMigrationStates(
  executor: PgQueryExecutor,
  sourceSystem: string,
  legacyAppointmentRowId: number
): Promise<LegacyAppointmentMigrationState[]> {
  const result = await executor.query<LegacyAppointmentMigrationRow>(
    `SELECT
       m.source_system,
       m.legacy_appointment_row_id,
       m.created_at AS mapping_created_at,
       a.*
     FROM legacy_appointment_identity_map m
     JOIN appointments a ON a.id = m.appointment_id
     WHERE m.source_system = $1
       AND m.legacy_appointment_row_id = $2`,
    [sourceSystem, legacyAppointmentRowId]
  );

  return result.rows.map(mapLegacyAppointmentMigrationRow);
}
