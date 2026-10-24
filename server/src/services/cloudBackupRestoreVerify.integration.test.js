import test from "node:test";
import assert from "node:assert/strict";
import { getPostgresPool } from "../db/postgres/pool.js";
import { listMigrations } from "../db/postgres/migrate.js";
import { clinicalBackupTables, createEncryptedCloudBackup } from "./cloudBackupArchive.js";
import { verifyBackupRestoreInLocalTestDatabase, assertDisposableRestoreTarget } from "./cloudBackupRestoreVerify.js";

const enabled = process.env.PG_BACKUP_RESTORE_VERIFY === "1";
(enabled ? test : test.skip)("encrypted backup reconstructs clinical relations and private files in a rollback-only local database", async () => {
  assertDisposableRestoreTarget(process.env);
  const pool = await getPostgresPool();
  const connection = await pool.connect();
  const sourceRef = "fictional-demo-project";
  const passphrase = "fictional-integration-recovery-phrase";
  const patient = "P-2026-9876";
  const treatment = "T-2026-9876";
  const filePath = "patients/P-2026-9876/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.txt";
  const contents = Buffer.from("Fictional private attachment contents");
  const tables = {};
  let begun = false;
  try {
    const tableCounts = await Promise.all(clinicalBackupTables.map(t =>
      pool.query("SELECT COUNT(*)::int AS count FROM public." + t)));
    assert.ok(tableCounts.every(v => v.rows[0].count === 0), "Do not run test on a nonempty local database");
    await connection.query("BEGIN");
    begun = true;
    await connection.query("INSERT INTO public.patients (patient_id, date_registered, last_name, first_name, birthday, gender, mobile_number) VALUES ($1, '2026-10-24', 'FICTIONAL_BACKUP', 'Example', '1990-01-01', 'Female', '09000000000')",[patient]);
    await connection.query("INSERT INTO public.treatments (treatment_id, patient_id, treatment_date, procedure, dentists, amount_charged, net_amount_due, amount_paid, balance) VALUES ($1,$2,'2026-10-24','Fictional Cleaning','Demo Dentist',100,100,25,75)",[treatment,patient]);
    await connection.query("INSERT INTO public.appointments (patient_id, appointment_date, status, planned_procedure) VALUES ($1,'2026-10-25','Scheduled','Fictional appointment')",[patient]);
    await connection.query("INSERT INTO public.treatment_payments (treatment_id, amount_cents, payment_date, source, payment_method) VALUES ($1,2500,'2026-10-24','recorded','Cash')",[treatment]);
    await connection.query("INSERT INTO public.attachments (patient_id, attachment_type, original_filename, stored_filename, file_path, mime_type, file_size) VALUES ($1,'Demo','fictional.txt','fictional.txt',$2,'text/plain',$3)",[patient,filePath,contents.length]);
    await connection.query("INSERT INTO public.public_id_counters (prefix, sequence_year, last_value) VALUES ('P',2026,9876),('T',2026,9876)");
    for (const [table, order] of Object.entries({patients:"id",treatments:"id",appointments:"id",treatment_payments:"id",attachments:"id",public_id_counters:"prefix,sequence_year"})) {
      tables[table] = (await connection.query("SELECT * FROM public."+table+" ORDER BY "+order)).rows;
    }
  } finally {
    if (begun) await connection.query("ROLLBACK");
    connection.release();
  }
  const migrations=(await listMigrations()).map(m=>({filename:m.name,checksum:m.checksum}));
  try {
    const {data}=await createEncryptedCloudBackup({projectRef:sourceRef,records:tables,migrations,files:[{path:filePath,contents}]},passphrase);
    const result=await verifyBackupRestoreInLocalTestDatabase({pool,encryptedArchive:data,passphrase,env:process.env,expectedSourceRef:sourceRef});
    assert.equal(result.verified,true);
    assert.equal(result.rolledBack,true);
    assert.equal(result.rows.patients,1);
    assert.equal(result.privateFiles,1);
    for(const table of clinicalBackupTables) {
      assert.equal(Number((await pool.query("SELECT COUNT(*) AS count FROM public."+table)).rows[0].count),0);
    }
  } finally {
    await pool.end();
  }
});
