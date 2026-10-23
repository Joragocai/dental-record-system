// Operates on an already-open demo SQLite connection. The caller must enforce
// demo-mode path guards before using this destructive operation.
export function clearDemoDatabaseRecords(database) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec([
      "DELETE FROM treatment_payments;",
      "DELETE FROM attachments;",
      "DELETE FROM appointments;",
      "DELETE FROM treatments;",
      "DELETE FROM patients;",
      "DELETE FROM sqlite_sequence WHERE name IN ('patients', 'treatments', 'appointments', 'attachments', 'treatment_payments');"
    ].join("\n"));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
