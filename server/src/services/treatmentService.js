import db from "../db/database.js";

const treatmentFields = [
  "treatment_id",
  "patient_id",
  "treatment_date",
  "tooth_numbers",
  "next_appointment",
  "procedure",
  "dentists",
  "amount_charged",
  "amount_paid",
  "balance",
  "remarks"
];

export function listTreatments() {
  return db
    .prepare(
      `SELECT t.*,
              (
                SELECT COUNT(*)
                FROM attachments a
                WHERE a.treatment_id = t.treatment_id
              ) AS attachment_count
       FROM treatments t
       ORDER BY t.treatment_date DESC, t.treatment_id DESC`
    )
    .all();
}

export function getTreatmentByTreatmentId(treatmentId) {
  return db
    .prepare(
      `SELECT t.*,
              (
                SELECT COUNT(*)
                FROM attachments a
                WHERE a.treatment_id = t.treatment_id
              ) AS attachment_count
       FROM treatments t
       WHERE t.treatment_id = ?`
    )
    .get(treatmentId);
}

export function getTreatmentsByPatientId(patientId) {
  return db
    .prepare(
      `SELECT t.*,
              (
                SELECT COUNT(*)
                FROM attachments a
                WHERE a.treatment_id = t.treatment_id
              ) AS attachment_count
       FROM treatments t
       WHERE t.patient_id = ?
       ORDER BY t.treatment_date DESC, t.treatment_id DESC`
    )
    .all(patientId);
}

export function createTreatment(treatment, now) {
  const fields = [...treatmentFields, "created_at", "updated_at"];
  const values = fields.map((field) => (field === "created_at" || field === "updated_at" ? now : treatment[field] ?? null));
  const placeholders = fields.map(() => "?").join(", ");
  db.prepare(`INSERT INTO treatments (${fields.join(", ")}) VALUES (${placeholders})`).run(...values);
  return getTreatmentByTreatmentId(treatment.treatment_id);
}

export function updateTreatment(treatmentId, treatment, now) {
  const assignments = treatmentFields.map((field) => `${field} = ?`).join(", ");
  const values = treatmentFields.map((field) => treatment[field] ?? null);
  db.prepare(`UPDATE treatments SET ${assignments}, updated_at = ? WHERE treatment_id = ?`).run(...values, now, treatmentId);
  return getTreatmentByTreatmentId(treatmentId);
}
