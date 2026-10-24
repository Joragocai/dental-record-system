import assert from "node:assert/strict";
import { inspectEncryptedCloudBackup, clinicalBackupTables } from "./cloudBackupArchive.js";
import { listMigrations } from "../db/postgres/migrate.js";

// This module deliberately has NO commit path and NO remote restore API.
// It replays an encrypted snapshot into the existing, EMPTY, isolated local
// test database and rolls the entire transaction back on success or failure.
const restoreOrder = [
  "patients", "treatments", "appointments", "treatment_payments",
  "attachments", "public_id_counters"
];
const sortedBy = {
  patients: "id", treatments: "id", appointments: "id",
  treatment_payments: "id", attachments: "id",
  public_id_counters: "prefix, sequence_year"
};
const normalize = value => JSON.parse(JSON.stringify(value));
const sameRows = (left, right) => assert.deepStrictEqual(normalize(left), normalize(right));
const invalid = message => new Error("Isolated restore verification failed: " + message);

export function assertDisposableRestoreTarget(env = process.env) {
  if (env.PG_BACKUP_RESTORE_VERIFY !== "1" || env.NODE_ENV === "production") {
    throw invalid("explicit test-only opt-in required");
  }
  let url;
  try { url = new URL(env.DATABASE_URL || ""); } catch { throw invalid("invalid target"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname !== "/dental_presentation_test") {
    throw invalid("the target must be the dedicated local test database");
  }
  return "dental_presentation_test";
}

async function assertEmpty(clinicalClient) {
  for (const table of clinicalBackupTables) {
    const { rows } = await clinicalClient.query("SELECT COUNT(*)::integer AS count FROM public." + table);
    if (Number(rows[0].count) !== 0) throw invalid("target table " + table + " is not empty");
  }
}

async function insertSnapshotRows(client, table, rows) {
  if (!rows.length) return;
  const info = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
    [table]
  );
  const columns = info.rows.map(row => row.column_name);
  if (!columns.length) throw invalid("missing target table: " + table);
  const expected = [...columns].sort().join("|");
  const quoted = columns.map(column => '"' + column.replaceAll('"', '""') + '"');
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        Object.keys(row).sort().join("|") !== expected) throw invalid("invalid " + table + " columns");
    await client.query(
      "INSERT INTO public." + table + " (" + quoted.join(",") + ") VALUES (" +
        columns.map((_, index) => "$" + (index + 1)).join(",") + ")",
      columns.map(column => row[column])
    );
  }
}

async function verifyRestoredTables(client, snapshot) {
  for (const table of clinicalBackupTables) {
    const rows = (await client.query("SELECT * FROM public." + table + " ORDER BY " + sortedBy[table])).rows;
    const expected = [...snapshot.tables[table]].sort((a, b) => {
      if (table === "public_id_counters") return (a.prefix + a.sequence_year).localeCompare(b.prefix + b.sequence_year);
      return Number(a.id) - Number(b.id);
    });
    sameRows(rows, expected);
  }
}

export async function verifyBackupRestoreInLocalTestDatabase({
  pool, encryptedArchive, passphrase, env = process.env, expectedSourceRef
}) {
  const targetName = assertDisposableRestoreTarget(env);
  const { manifest, snapshot, files } = await inspectEncryptedCloudBackup(encryptedArchive, passphrase);
  if (expectedSourceRef && manifest.projectRef !== expectedSourceRef) throw invalid("unexpected source project");
  const expected = await listMigrations();
  if (snapshot.migrations.length !== expected.length ||
      snapshot.migrations.some((item, i) =>
        item.filename !== expected[i].name || item.checksum !== expected[i].checksum)) {
    throw invalid("source migration checksums do not match the application");
  }
  const attachmentPaths = new Map(files.map(file => [file.path, file.contents]));
  for (const row of snapshot.tables.attachments) {
    const bytes = attachmentPaths.get(row.file_path);
    if (!bytes || (row.file_size != null && Number(row.file_size) !== bytes.length)) {
      throw invalid("attachment bytes do not match the archived metadata");
    }
  }
  // Restore the private files into an isolated in-memory Storage stand-in.
  // No Supabase bucket or local file is written during the verification.
  const restoredStorage = new Map(files.map(file => [file.path, Buffer.from(file.contents)]));
  const client = await pool.connect();
  let began = false;
  try {
    const name = (await client.query("SELECT current_database() AS name")).rows[0]?.name;
    if (name !== targetName) throw invalid("connected to unexpected database");
    await client.query("BEGIN");
    began = true;
    await client.query("SET LOCAL lock_timeout = '4000ms'");
    await client.query("SET LOCAL statement_timeout = '60000ms'");
    await client.query("LOCK TABLE " +
      clinicalBackupTables.map(table => "public." + table).join(", ") + " IN ACCESS EXCLUSIVE MODE");
    await assertEmpty(client);

    const installed = (await client.query(
      "SELECT filename, checksum FROM public.schema_migrations ORDER BY filename"
    )).rows;
    sameRows(installed, snapshot.migrations);

    for (const table of restoreOrder) {
      if (table === "appointments") {
        // Treatment insert triggers automatically create linked appointments.
        // The target was verified empty and is locked; remove only these
        // uncommitted trigger rows before rehydrating the archived history.
        await client.query("DELETE FROM public.appointments");
      }
      const rows = table === "treatment_payments"
        ? [...snapshot.tables[table]].sort((a, b) =>
          Number(a.source === "reversal") - Number(b.source === "reversal") || Number(a.id) - Number(b.id))
        : snapshot.tables[table];
      await insertSnapshotRows(client, table, rows);
    }
    await verifyRestoredTables(client, snapshot);
    for (const file of files) {
      assert.deepStrictEqual(restoredStorage.get(file.path), file.contents);
    }
    return {
      verified: true, rolledBack: true,
      rows: Object.fromEntries(clinicalBackupTables.map(table => [table, snapshot.tables[table].length])),
      privateFiles: restoredStorage.size, migrations: installed.length
    };
  } finally {
    try {
      if (began) await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
}
