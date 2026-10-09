import type { QueryResultRow } from "pg";
import type { PgQueryExecutor } from "../postgres/pool.js";
import { normalizePgDateOnly, type PgDateOnlyValue } from "../postgres/dateOnly.js";
import type { AppointmentStatus } from "../postgres/batchC/appointments.js";

export interface AppointmentRecord {
  id: string;
  patientId: string;
  patientCode?: string | null;
  patientDisplayName?: string | null;
  patientMobileNumber?: string | null;
  branchId: string;
  dentistUserId: string | null;
  appointmentDate: string;
  appointmentTime: string | null;
  durationMinutes: number | null;
  plannedProcedure: string | null;
  notes: string | null;
  status: AppointmentStatus;
  rescheduledFromAppointmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentHistoryRecord {
  id: string;
  appointmentId: string;
  action: string;
  previousStatus: AppointmentStatus | null;
  newStatus: AppointmentStatus | null;
  previousBranchId: string | null;
  newBranchId: string | null;
  previousDentistUserId: string | null;
  newDentistUserId: string | null;
  previousAppointmentDate: string | null;
  newAppointmentDate: string | null;
  previousAppointmentTime: string | null;
  newAppointmentTime: string | null;
  previousDurationMinutes: number | null;
  newDurationMinutes: number | null;
  reason: string | null;
  relatedAppointmentId: string | null;
  actorUserId: string | null;
  requestId: string | null;
  occurredAt: string;
}

export interface AppointmentListFilter {
  branchId: string;
  date?: string | null;
  dentistUserId?: string | null;
  status?: AppointmentStatus | null;
}

export interface MinimalAppointmentPatient {
  id: string;
  patientCode: string;
  displayName: string;
  mobileNumber: string;
}

export interface SchedulingDentist {
  id: string;
  displayName: string;
}

export interface SchedulingBranch {
  id: string;
  branchCode: string;
  branchName: string;
}

export interface AppointmentRepository {
  branchExists(branchId: string): Promise<boolean>;
  patientExists(patientId: string): Promise<boolean>;
  getById(id: string): Promise<AppointmentRecord | null>;
  getByIdForUpdate(id: string): Promise<AppointmentRecord | null>;
  list(filter: AppointmentListFilter): Promise<AppointmentRecord[]>;
  searchPatients(query: string, limit: number): Promise<MinimalAppointmentPatient[]>;
  getBranch(branchId: string): Promise<SchedulingBranch | null>;
  listBranchesByIds(branchIds: readonly string[]): Promise<SchedulingBranch[]>;
  listActiveDentistsForBranch(branchId: string): Promise<SchedulingDentist[]>;
  dentistIsActiveAndAssigned(dentistUserId: string, branchId: string): Promise<boolean>;
  lockDentistDate(dentistUserId: string, appointmentDate: string): Promise<void>;
  hasOverlappingReservation(input: {
    dentistUserId: string;
    appointmentDate: string;
    appointmentTime: string;
    durationMinutes: number;
    excludeAppointmentId?: string | null;
  }): Promise<boolean>;
  insert(record: AppointmentRecord): Promise<AppointmentRecord>;
  update(record: AppointmentRecord): Promise<AppointmentRecord | null>;
  insertHistory(record: AppointmentHistoryRecord): Promise<void>;
}

interface AppointmentRow extends QueryResultRow {
  id: string;
  patient_id: string;
  branch_id: string;
  dentist_user_id: string | null;
  appointment_date: PgDateOnlyValue;
  appointment_time: string | null;
  duration_minutes: number | null;
  planned_procedure: string | null;
  notes: string | null;
  status: AppointmentStatus;
  rescheduled_from_appointment_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  patient_code?: string | null;
  patient_display_name?: string | null;
  patient_mobile_number?: string | null;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalizeTime(value: string | null): string | null {
  if (value === null) return null;
  const match = String(value).match(/^([01]\d|2[0-3]):([0-5]\d)/);
  return match ? `${match[1]}:${match[2]}` : String(value);
}

function mapAppointment(row: AppointmentRow): AppointmentRecord {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    patientCode: row.patient_code == null ? null : String(row.patient_code),
    patientDisplayName: row.patient_display_name == null ? null : String(row.patient_display_name),
    patientMobileNumber: row.patient_mobile_number == null ? null : String(row.patient_mobile_number),
    branchId: String(row.branch_id),
    dentistUserId: row.dentist_user_id === null ? null : String(row.dentist_user_id),
    appointmentDate: normalizePgDateOnly(row.appointment_date, "Appointment appointment_date"),
    appointmentTime: normalizeTime(row.appointment_time),
    durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
    plannedProcedure: row.planned_procedure === null ? null : String(row.planned_procedure),
    notes: row.notes === null ? null : String(row.notes),
    status: row.status,
    rescheduledFromAppointmentId:
      row.rescheduled_from_appointment_id === null ? null : String(row.rescheduled_from_appointment_id),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

const selectColumns = `
  id, patient_id, branch_id, dentist_user_id, appointment_date, appointment_time,
  duration_minutes, planned_procedure, notes, status, rescheduled_from_appointment_id,
  created_at, updated_at
`;

const readColumns = `
  a.id, a.patient_id, a.branch_id, a.dentist_user_id, a.appointment_date, a.appointment_time,
  a.duration_minutes, a.planned_procedure, a.notes, a.status, a.rescheduled_from_appointment_id,
  a.created_at, a.updated_at,
  p.patient_code,
  trim(concat_ws(' ', p.first_name, p.middle_name, p.last_name)) AS patient_display_name,
  p.mobile_number AS patient_mobile_number
`;

export function createAppointmentRepository(executor: PgQueryExecutor): AppointmentRepository {
  return {
    async branchExists(branchId) {
      const result = await executor.query("SELECT 1 FROM branches WHERE id = $1 LIMIT 1", [branchId]);
      return result.rowCount === 1;
    },
    async patientExists(patientId) {
      const result = await executor.query("SELECT 1 FROM patients WHERE id = $1 LIMIT 1", [patientId]);
      return result.rowCount === 1;
    },
    async getById(id) {
      const result = await executor.query<AppointmentRow>(
        `SELECT ${readColumns}
         FROM appointments a
         INNER JOIN patients p ON p.id = a.patient_id
         WHERE a.id = $1
         LIMIT 1`,
        [id]
      );
      return result.rows[0] ? mapAppointment(result.rows[0]) : null;
    },
    async getByIdForUpdate(id) {
      const result = await executor.query<AppointmentRow>(
        `SELECT ${readColumns}
         FROM appointments a
         INNER JOIN patients p ON p.id = a.patient_id
         WHERE a.id = $1
         FOR UPDATE OF a`,
        [id]
      );
      return result.rows[0] ? mapAppointment(result.rows[0]) : null;
    },
    async list(filter) {
      const values: unknown[] = [filter.branchId];
      const where = ["branch_id = $1"];
      if (filter.date) {
        values.push(filter.date);
        where.push(`appointment_date = $${values.length}::date`);
      }
      if (filter.dentistUserId) {
        values.push(filter.dentistUserId);
        where.push(`dentist_user_id = $${values.length}`);
      }
      if (filter.status) {
        values.push(filter.status);
        where.push(`status = $${values.length}`);
      }
      const result = await executor.query<AppointmentRow>(
        `SELECT ${readColumns}
         FROM appointments a
         INNER JOIN patients p ON p.id = a.patient_id
         WHERE ${where.map((clause) => `a.${clause}`).join(" AND ")}
         ORDER BY a.appointment_date ASC, a.appointment_time ASC NULLS FIRST, a.id ASC`,
        values
      );
      return result.rows.map(mapAppointment);
    },
    async searchPatients(query, limit) {
      const pattern = `%${query}%`;
      const result = await executor.query<{
        id: string;
        patient_code: string;
        display_name: string;
        mobile_number: string;
      }>(
        `SELECT id::text,
                patient_code,
                trim(concat_ws(' ', first_name, middle_name, last_name)) AS display_name,
                mobile_number
         FROM patients
         WHERE patient_code ILIKE $1
            OR first_name ILIKE $1
            OR last_name ILIKE $1
            OR trim(concat_ws(' ', first_name, middle_name, last_name)) ILIKE $1
            OR trim(concat_ws(' ', first_name, last_name)) ILIKE $1
            OR trim(concat_ws(' ', last_name, first_name, middle_name)) ILIKE $1
            OR trim(concat_ws(' ', last_name, first_name)) ILIKE $1
            OR mobile_number ILIKE $1
         ORDER BY last_name, first_name, patient_code
         LIMIT $2`,
        [pattern, limit]
      );
      return result.rows.map((row) => ({
        id: row.id,
        patientCode: row.patient_code,
        displayName: row.display_name,
        mobileNumber: row.mobile_number
      }));
    },
    async getBranch(branchId) {
      const result = await executor.query<{ id: string; branch_code: string; branch_name: string }>(
        "SELECT id::text, branch_code, branch_name FROM branches WHERE id = $1 LIMIT 1",
        [branchId]
      );
      const row = result.rows[0];
      return row ? { id: row.id, branchCode: row.branch_code, branchName: row.branch_name } : null;
    },
    async listBranchesByIds(branchIds) {
      if (branchIds.length === 0) return [];
      const result = await executor.query<{ id: string; branch_code: string; branch_name: string }>(
        `SELECT id::text, branch_code, branch_name
         FROM branches
         WHERE id = ANY($1::uuid[])
         ORDER BY branch_name, branch_code, id`,
        [[...branchIds]]
      );
      return result.rows.map((row) => ({
        id: row.id,
        branchCode: row.branch_code,
        branchName: row.branch_name
      }));
    },
    async listActiveDentistsForBranch(branchId) {
      const result = await executor.query<{ id: string; display_name: string }>(
        `SELECT DISTINCT u.id::text, u.display_name
         FROM app_users u
         INNER JOIN user_roles ur ON ur.user_id = u.id
         INNER JOIN roles r ON r.id = ur.role_id AND r.code = 'DENTIST'
         INNER JOIN user_branches ub ON ub.user_id = u.id AND ub.branch_id = $1
         WHERE u.status = 'active'
         ORDER BY u.display_name, u.id::text`,
        [branchId]
      );
      return result.rows.map((row) => ({ id: row.id, displayName: row.display_name }));
    },
    async dentistIsActiveAndAssigned(dentistUserId, branchId) {
      const result = await executor.query(
        `SELECT 1
         FROM app_users u
         INNER JOIN user_roles ur ON ur.user_id = u.id
         INNER JOIN roles r ON r.id = ur.role_id AND r.code = 'DENTIST'
         INNER JOIN user_branches ub ON ub.user_id = u.id AND ub.branch_id = $2
         WHERE u.id = $1 AND u.status = 'active'
         LIMIT 1`,
        [dentistUserId, branchId]
      );
      return result.rowCount === 1;
    },
    async lockDentistDate(dentistUserId, appointmentDate) {
      await executor.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`appointment-slot:${dentistUserId}:${appointmentDate}`]
      );
    },
    async hasOverlappingReservation(input) {
      const result = await executor.query(
        `SELECT 1
         FROM appointments
         WHERE dentist_user_id = $1
           AND appointment_date = $2::date
           AND status IN ('confirmed', 'checked_in', 'in_progress')
           AND appointment_time IS NOT NULL
           AND duration_minutes IS NOT NULL
           AND ($3::time::text::time) IS NOT NULL
           AND (
             (EXTRACT(EPOCH FROM appointment_time) / 60) < ((EXTRACT(EPOCH FROM $3::time) / 60) + $4)
             AND ((EXTRACT(EPOCH FROM appointment_time) / 60) + duration_minutes) > (EXTRACT(EPOCH FROM $3::time) / 60)
           )
           AND ($5::uuid IS NULL OR id <> $5::uuid)
         LIMIT 1`,
        [
          input.dentistUserId,
          input.appointmentDate,
          input.appointmentTime,
          input.durationMinutes,
          input.excludeAppointmentId ?? null
        ]
      );
      return result.rowCount === 1;
    },
    async insert(record) {
      const result = await executor.query<AppointmentRow>(
        `INSERT INTO appointments (
           id, patient_id, branch_id, dentist_user_id, appointment_date, appointment_time,
           duration_minutes, planned_procedure, notes, status, rescheduled_from_appointment_id,
           created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5::date,$6::time,$7,$8,$9,$10,$11,$12,$13)
         RETURNING ${selectColumns}`,
        [
          record.id,
          record.patientId,
          record.branchId,
          record.dentistUserId,
          record.appointmentDate,
          record.appointmentTime,
          record.durationMinutes,
          record.plannedProcedure,
          record.notes,
          record.status,
          record.rescheduledFromAppointmentId,
          record.createdAt,
          record.updatedAt
        ]
      );
      const row = result.rows[0];
      if (!row) throw new Error("Appointment insert did not return a row.");
      return mapAppointment(row);
    },
    async update(record) {
      const result = await executor.query<AppointmentRow>(
        `UPDATE appointments
         SET patient_id = $2,
             branch_id = $3,
             dentist_user_id = $4,
             appointment_date = $5::date,
             appointment_time = $6::time,
             duration_minutes = $7,
             planned_procedure = $8,
             notes = $9,
             status = $10,
             rescheduled_from_appointment_id = $11,
             updated_at = $12
         WHERE id = $1
         RETURNING ${selectColumns}`,
        [
          record.id,
          record.patientId,
          record.branchId,
          record.dentistUserId,
          record.appointmentDate,
          record.appointmentTime,
          record.durationMinutes,
          record.plannedProcedure,
          record.notes,
          record.status,
          record.rescheduledFromAppointmentId,
          record.updatedAt
        ]
      );
      return result.rows[0] ? mapAppointment(result.rows[0]) : null;
    },
    async insertHistory(record) {
      await executor.query(
        `INSERT INTO appointment_history (
           id, appointment_id, action, previous_status, new_status,
           previous_branch_id, new_branch_id, previous_dentist_user_id, new_dentist_user_id,
           previous_appointment_date, new_appointment_date, previous_appointment_time, new_appointment_time,
           previous_duration_minutes, new_duration_minutes, reason, related_appointment_id,
           actor_user_id, request_id, occurred_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12::time,$13::time,
           $14,$15,$16,$17,$18,$19,$20
         )`,
        [
          record.id,
          record.appointmentId,
          record.action,
          record.previousStatus,
          record.newStatus,
          record.previousBranchId,
          record.newBranchId,
          record.previousDentistUserId,
          record.newDentistUserId,
          record.previousAppointmentDate,
          record.newAppointmentDate,
          record.previousAppointmentTime,
          record.newAppointmentTime,
          record.previousDurationMinutes,
          record.newDurationMinutes,
          record.reason,
          record.relatedAppointmentId,
          record.actorUserId,
          record.requestId,
          record.occurredAt
        ]
      );
    }
  };
}
