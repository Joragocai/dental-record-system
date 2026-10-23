import { buildMedicalAlertSummary } from "../../utils/patientUtils.js";
import { patientFields } from "../../services/patientFields.js";
import { normalizePgRow } from "./format.js";
import { getPostgresPatient } from "./patients.js";

const dateFields = new Set(["date_registered", "birthday", "insurance_effective_date", "last_dental_visit"]);
const booleanFields = new Set(patientFields.filter((name) => name.startsWith("condition_")));
const allowedColumns = Object.freeze([...patientFields, "created_at", "updated_at"]);

export function buildPatientMutation(patient, timestamp, { update = false } = {}) {
  const row = { ...patient, medical_alert_summary: buildMedicalAlertSummary(patient) };
  const fields = update ? patientFields.filter((f) => f !== "patient_id") : allowedColumns;
  const values = fields.map((field) => {
    const value = field === "created_at" || field === "updated_at" ? timestamp : row[field] ?? null;
    if (dateFields.has(field) && value === "") return null;
    if (booleanFields.has(field)) return Number(value || 0);
    return value;
  });
  if (update) {
    const assignments = fields.map((field, index) => `${field} = $${index + 1}`).join(", ");
    return {
      sql: `UPDATE public.patients SET ${assignments}, updated_at = $${values.length + 1} WHERE patient_id = $${values.length + 2} RETURNING *`,
      values: [...values, timestamp, row.patient_id]
    };
  }
  return {
    sql: `INSERT INTO public.patients (${fields.join(", ")}) VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
    values
  };
}

export async function createPostgresPatient(client, patient, timestamp = new Date().toISOString()) {
  const { sql, values } = buildPatientMutation(patient, timestamp);
  const { rows } = await client.query(sql, values);
  if (!rows[0]) throw new Error("PostgreSQL patient creation returned no record.");
  return getPostgresPatient(client, rows[0].patient_id);
}

export async function updatePostgresPatient(client, patientId, patient, timestamp = new Date().toISOString()) {
  const { sql, values } = buildPatientMutation({ ...patient, patient_id: patientId }, timestamp, { update: true });
  const { rows } = await client.query(sql, values);
  if (!rows[0]) return null;
  return getPostgresPatient(client, patientId);
}

export async function listPostgresPatientRows(client) {
  const { rows } = await client.query("SELECT * FROM public.patients ORDER BY last_name, first_name, middle_name");
  return rows.map(normalizePgRow);
}
