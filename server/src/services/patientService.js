import db from "../db/database.js";
import { buildMedicalAlertSummary, buildPatientDisplayName } from "../utils/patientUtils.js";

import { patientFields } from "./patientFields.js";

function normalizePatient(patient) {
  const next = { ...patient };
  next.medical_alert_summary = buildMedicalAlertSummary(next);
  return next;
}

function decoratePatient(row) {
  return row
    ? {
        ...row,
        medical_alert_summary: buildMedicalAlertSummary(row),
        display_name: buildPatientDisplayName(row)
      }
    : null;
}

export function listPatients() {
  const rows = db.prepare("SELECT * FROM patients ORDER BY last_name, first_name, middle_name").all();
  return rows.map(decoratePatient);
}

export function searchPatients(query) {
  const value = `%${query.trim()}%`;
  const rows = db
    .prepare(
      `SELECT * FROM patients
       WHERE last_name LIKE ?
          OR first_name LIKE ?
          OR patient_id LIKE ?
          OR mobile_number LIKE ?
       ORDER BY last_name, first_name, middle_name`
    )
    .all(value, value, value, value);
  return rows.map(decoratePatient);
}

export function getPatientByPatientId(patientId) {
  const row = db.prepare("SELECT * FROM patients WHERE patient_id = ?").get(patientId);
  return decoratePatient(row);
}

export function createPatient(patient, now) {
  const normalized = normalizePatient(patient);
  const fields = [...patientFields, "created_at", "updated_at"];
  const values = fields.map((field) => (field === "created_at" || field === "updated_at" ? now : normalized[field] ?? null));
  const placeholders = fields.map(() => "?").join(", ");
  db.prepare(`INSERT INTO patients (${fields.join(", ")}) VALUES (${placeholders})`).run(...values);
  return getPatientByPatientId(normalized.patient_id);
}

export function updatePatient(patientId, patient, now) {
  const normalized = normalizePatient(patient);
  const assignments = patientFields.map((field) => `${field} = ?`).join(", ");
  const values = patientFields.map((field) => normalized[field] ?? null);
  db.prepare(`UPDATE patients SET ${assignments}, updated_at = ? WHERE patient_id = ?`).run(...values, now, patientId);
  return getPatientByPatientId(patientId);
}
