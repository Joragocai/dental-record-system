import db from "../db/database.js";
import { buildPatientDisplayName } from "../utils/patientUtils.js";

const appointmentFields = [
  "patient_id",
  "appointment_date",
  "appointment_time",
  "planned_procedure",
  "notes",
  "status"
] as const;

type AppointmentFieldName = (typeof appointmentFields)[number];

interface AppointmentInput {
  patient_id: string;
  appointment_date: string;
  appointment_time: string;
  planned_procedure: string;
  notes: string;
  status: string;
}

interface AppointmentJoinedRow extends AppointmentInput {
  id: number;
  created_at: string;
  updated_at: string;
  patient_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  mobile_number?: string | null;
  branch_location?: string | null;
}

type SqlValue = string | number | bigint | Uint8Array | null;
type SqlRow = Record<string, SqlValue>;

export interface AppointmentRecord extends AppointmentInput {
  id: number;
  created_at: string;
  updated_at: string;
  patient_name: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  mobile_number?: string | null;
  branch_location?: string | null;
}

function decorateAppointment(row: AppointmentJoinedRow | null | undefined): AppointmentRecord | null {
  if (!row) return null;

  return {
    ...row,
    patient_name: row.patient_name || buildPatientDisplayName(row),
    planned_procedure: row.planned_procedure || "",
    appointment_time: row.appointment_time || "",
    notes: row.notes || "",
    status: row.status || "Scheduled"
  };
}

function toOptionalText(value: SqlValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  return String(value);
}

function toRequiredText(value: SqlValue | undefined): string {
  return toOptionalText(value) || "";
}

function toAppointmentJoinedRow(row: SqlRow | null | undefined): AppointmentJoinedRow | null {
  if (!row) return null;

  return {
    id: Number(row.id ?? 0),
    patient_id: toRequiredText(row.patient_id),
    appointment_date: toRequiredText(row.appointment_date),
    appointment_time: toRequiredText(row.appointment_time),
    planned_procedure: toRequiredText(row.planned_procedure),
    notes: toRequiredText(row.notes),
    status: toRequiredText(row.status),
    created_at: toRequiredText(row.created_at),
    updated_at: toRequiredText(row.updated_at),
    patient_name: toOptionalText(row.patient_name),
    first_name: toOptionalText(row.first_name),
    middle_name: toOptionalText(row.middle_name),
    last_name: toOptionalText(row.last_name),
    mobile_number: toOptionalText(row.mobile_number),
    branch_location: toOptionalText(row.branch_location)
  };
}

function getAppointmentValues(appointment: AppointmentInput, now?: string): Array<string | null> {
  return [
    appointment.patient_id,
    appointment.appointment_date,
    appointment.appointment_time ?? null,
    appointment.planned_procedure ?? null,
    appointment.notes ?? null,
    appointment.status ?? null,
    ...(now ? [now, now] : [])
  ];
}

export function listAppointmentsByPatientId(patientId: string): AppointmentRecord[] {
  const rows = db
    .prepare(
      `SELECT a.*, p.patient_id, p.first_name, p.middle_name, p.last_name, p.mobile_number, p.branch_location
       FROM appointments a
       JOIN patients p ON p.patient_id = a.patient_id
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC, (a.appointment_time IS NULL OR trim(a.appointment_time) = ''), a.appointment_time DESC, a.id DESC`
    )
    .all(patientId);

  return rows
    .map((row) => toAppointmentJoinedRow(row))
    .map((row) => decorateAppointment(row))
    .filter((row): row is AppointmentRecord => row !== null);
}

export function getAppointmentById(id: number | string): AppointmentRecord | null {
  const row = db
    .prepare(
      `SELECT a.*, p.patient_id, p.first_name, p.middle_name, p.last_name, p.mobile_number, p.branch_location
       FROM appointments a
       JOIN patients p ON p.patient_id = a.patient_id
       WHERE a.id = ?`
    )
    .get(id);

  return decorateAppointment(toAppointmentJoinedRow(row));
}

export function createAppointment(appointment: AppointmentInput, now: string): AppointmentRecord | null {
  const fields = [...appointmentFields, "created_at", "updated_at"];
  const placeholders = fields.map(() => "?").join(", ");
  const result = db
    .prepare(`INSERT INTO appointments (${fields.join(", ")}) VALUES (${placeholders})`)
    .run(...getAppointmentValues(appointment, now));

  return getAppointmentById(Number(result.lastInsertRowid));
}

export function updateAppointment(id: number | string, appointment: AppointmentInput, now: string): AppointmentRecord | null {
  const assignments = appointmentFields.map((field) => `${field} = ?`).join(", ");
  db
    .prepare(`UPDATE appointments SET ${assignments}, updated_at = ? WHERE id = ?`)
    .run(...getAppointmentValues(appointment), now, id);

  return getAppointmentById(id);
}

export function updateAppointmentStatus(id: number | string, status: AppointmentFieldName | string, now: string): AppointmentRecord | null {
  db.prepare("UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
  return getAppointmentById(id);
}
