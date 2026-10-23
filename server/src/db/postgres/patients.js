import { buildMedicalAlertSummary, buildPatientDisplayName } from "../../utils/patientUtils.js";
import { normalizePgRow } from "./format.js";

// Initial PostgreSQL patient read adapter. Route switching occurs only after
// all dependent services and demo controls support asynchronous queries.
function decorate(row) {
  const normalized = normalizePgRow(row);
  if (!normalized) return null;
  return {
    ...normalized,
    medical_alert_summary: buildMedicalAlertSummary(normalized),
    display_name: buildPatientDisplayName(normalized)
  };
}

export async function listPostgresPatients(client) {
  const { rows } = await client.query(
    "SELECT * FROM public.patients ORDER BY last_name, first_name, middle_name"
  );
  return rows.map(decorate);
}

export async function getPostgresPatient(client, patientId) {
  const { rows } = await client.query(
    "SELECT * FROM public.patients WHERE patient_id = $1",
    [patientId]
  );
  return decorate(rows[0]);
}

export async function searchPostgresPatients(client, rawQuery) {
  const query = String(rawQuery ?? "").trim();
  if (!query) return listPostgresPatients(client);
  const escaped = query.replace(/[\\%_]/g, "\\$&");
  const { rows } = await client.query(
    `SELECT * FROM public.patients
     WHERE last_name ILIKE $1 ESCAPE '\\'
        OR first_name ILIKE $1 ESCAPE '\\'
        OR patient_id ILIKE $1 ESCAPE '\\'
        OR mobile_number ILIKE $1 ESCAPE '\\'
     ORDER BY last_name, first_name, middle_name`,
    [`%${escaped}%`]
  );
  return rows.map(decorate);
}
