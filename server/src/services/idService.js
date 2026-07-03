import db from "../db/database.js";

function buildId(prefix, year, sequence) {
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

function getNextSequence(prefix, year, tableName, columnName) {
  const row = db
    .prepare(
      `SELECT ${columnName} AS value
       FROM ${tableName}
       WHERE ${columnName} LIKE ?
       ORDER BY ${columnName} DESC
       LIMIT 1`
    )
    .get(`${prefix}-${year}-%`);

  if (!row?.value) return 1;
  const parts = row.value.split("-");
  const currentSequence = Number(parts[2]);
  return Number.isFinite(currentSequence) ? currentSequence + 1 : 1;
}

export function getNextPatientId(date = new Date()) {
  const year = date.getFullYear();
  return buildId("P", year, getNextSequence("P", year, "patients", "patient_id"));
}

export function getNextTreatmentId(date = new Date()) {
  const year = date.getFullYear();
  return buildId("T", year, getNextSequence("T", year, "treatments", "treatment_id"));
}
