import db from "../db/database.js";
import { buildPatientDisplayName } from "../utils/patientUtils.js";

const appointmentFields = [
  "patient_id",
  "appointment_date",
  "appointment_time",
  "planned_procedure",
  "notes",
  "status"
];

function decorateAppointment(row) {
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

export function listAppointmentsByPatientId(patientId) {
  return db
    .prepare(
      `SELECT a.*, p.patient_id, p.first_name, p.middle_name, p.last_name, p.mobile_number, p.branch_location
       FROM appointments a
       JOIN patients p ON p.patient_id = a.patient_id
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC, (a.appointment_time IS NULL OR trim(a.appointment_time) = ''), a.appointment_time DESC, a.id DESC`
    )
    .all(patientId)
    .map(decorateAppointment);
}

export function getAppointmentById(id) {
  return decorateAppointment(
    db
      .prepare(
        `SELECT a.*, p.patient_id, p.first_name, p.middle_name, p.last_name, p.mobile_number, p.branch_location
         FROM appointments a
         JOIN patients p ON p.patient_id = a.patient_id
         WHERE a.id = ?`
      )
      .get(id)
  );
}

export function createAppointment(appointment, now) {
  const fields = [...appointmentFields, "created_at", "updated_at"];
  const values = fields.map((field) => (field === "created_at" || field === "updated_at" ? now : appointment[field] ?? null));
  const placeholders = fields.map(() => "?").join(", ");
  const result = db.prepare(`INSERT INTO appointments (${fields.join(", ")}) VALUES (${placeholders})`).run(...values);
  return getAppointmentById(result.lastInsertRowid);
}

export function updateAppointment(id, appointment, now) {
  const assignments = appointmentFields.map((field) => `${field} = ?`).join(", ");
  const values = appointmentFields.map((field) => appointment[field] ?? null);
  db.prepare(`UPDATE appointments SET ${assignments}, updated_at = ? WHERE id = ?`).run(...values, now, id);
  return getAppointmentById(id);
}

export function updateAppointmentStatus(id, status, now) {
  db.prepare("UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
  return getAppointmentById(id);
}
