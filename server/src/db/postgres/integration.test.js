import test from "node:test";
import assert from "node:assert/strict";
import { getPostgresPool } from "./pool.js";
import { listMigrations } from "./migrate.js";

const enabled = process.env.PG_INTEGRATION_TEST === "1";
const integration = enabled ? test : test.skip;
integration("isolated PostgreSQL schema smoke test rolls back fixture writes", async () => {
  const database = new URL(process.env.DATABASE_URL || "");
  assert.equal(database.pathname, "/dental_presentation_test", "Never run destructive integration checks outside the approved isolated database");
  const pool = await getPostgresPool();
  const connection = await pool.connect();
  const suffix = `${process.pid}`;
  const patientId = `P-2026-${suffix.padStart(4, "0").slice(-4)}`;
  const treatmentId = `T-2026-${suffix.padStart(4, "0").slice(-4)}`;
  try {
    await connection.query("BEGIN");
    await connection.query(`INSERT INTO public.patients
      (patient_id, date_registered, last_name, first_name, birthday, gender, mobile_number)
      VALUES ($1, '2026-10-23', 'Test', 'Fictional', '1990-01-01', 'Female', '09170000000')`, [patientId]);
    await connection.query(`INSERT INTO public.treatments
      (treatment_id, patient_id, treatment_date, procedure, dentists,
       amount_charged, net_amount_due, amount_paid, balance)
      VALUES ($1,$2,'2026-10-23','Fictional Test','Test Dentist',8000,8000,0,8000)`, [treatmentId,patientId]);
    const patient = await connection.query("SELECT patient_id, date_registered FROM public.patients WHERE patient_id=$1", [patientId]);
    assert.equal(patient.rows[0].patient_id, patientId);
    // Schema smoke test remains rollback-only; payment integration is a
    // separate gate once disposable payment fixtures are implemented.
    await connection.query("ROLLBACK");
    const migrations = await listMigrations();
    const stored = await connection.query("SELECT filename, checksum FROM public.schema_migrations ORDER BY filename");
    assert.equal(stored.rows.length, migrations.length);
    assert.deepEqual(stored.rows.map(r=>r.filename),migrations.map(m=>m.name));
  } finally {
    try { await connection.query("ROLLBACK"); } catch {}
    connection.release();
    await pool.end();
  }
});
