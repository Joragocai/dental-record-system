import db from "../db/database.js";

const treatmentFields = [
  "treatment_id",
  "patient_id",
  "treatment_date",
  "tooth_numbers",
  "next_appointment",
  "next_appointment_date",
  "next_appointment_time",
  "procedure",
  "dentists",
  "amount_charged",
  "discount_type",
  "discount_percent",
  "discount_amount",
  "net_amount_due",
  "amount_paid",
  "balance",
  "remarks"
];

function decorateTreatment(row) {
  if (!row) return null;

  const amountCharged = Number(row.amount_charged || 0);
  const discountPercent = Number(row.discount_percent || 0);
  const discountAmount = row.discount_amount === null || row.discount_amount === undefined ? Number((amountCharged * discountPercent / 100).toFixed(2)) : Number(row.discount_amount || 0);
  const netAmountDue = row.net_amount_due === null || row.net_amount_due === undefined || row.net_amount_due === "" ? Number((amountCharged - discountAmount).toFixed(2)) : Number(row.net_amount_due || 0);
  const amountPaid = Number(row.amount_paid || 0);
  const balance = row.balance === null || row.balance === undefined || row.balance === "" ? Number((netAmountDue - amountPaid).toFixed(2)) : Number(row.balance || 0);

  return {
    ...row,
    next_appointment_date: row.next_appointment_date || row.next_appointment || "",
    next_appointment_time: row.next_appointment_time || "",
    next_appointment: row.next_appointment_date || row.next_appointment || "",
    discount_type: row.discount_type || "None",
    discount_percent: Number.isFinite(discountPercent) ? discountPercent : 0,
    discount_amount: Number.isFinite(discountAmount) ? discountAmount : 0,
    net_amount_due: Number.isFinite(netAmountDue) ? netAmountDue : amountCharged,
    balance: Number.isFinite(balance) ? balance : 0
  };
}

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
    .all()
    .map(decorateTreatment);
}

export function getTreatmentByTreatmentId(treatmentId) {
  return decorateTreatment(
    db
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
    .get(treatmentId)
  );
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
    .all(patientId)
    .map(decorateTreatment);
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
