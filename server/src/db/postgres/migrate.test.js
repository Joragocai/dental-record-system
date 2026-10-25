import test from "node:test";
import assert from "node:assert/strict";
import { listMigrations, runMigrations } from "./migrate.js";

test("migration files are ordered and checksummed", async () => {
  const migrations = await listMigrations();
  assert.deepEqual(migrations.map((item) => item.name), [
    "0001_core_schema.sql",
    "0002_payment_ledger.sql",
    "0003_workflow_indexes.sql",
    "0004_public_id_counters.sql",
    "0005_demo_guard.sql",
    "0006_treatment_followup_appointments.sql",
    "0007_followup_history_safety.sql",
    "0008_cloud_backup_export_history.sql"
  ]);
  for (const migration of migrations) assert.match(migration.checksum, /^[0-9a-f]{64}$/);
});

function mockClient(rows = []) {
  const statements = [];
  return {
    statements,
    query: async (sql, params) => {
      statements.push({ sql, params });
      if (sql.startsWith("SELECT filename, checksum")) return { rows };
      return { rows: [] };
    }
  };
}

test("fresh migrations run under one transaction and write checksums", async () => {
  const client = mockClient();
  const migrations = await listMigrations();
  const result = await runMigrations(client, migrations);
  assert.equal(result.applied.length, migrations.length);
  assert.equal(client.statements[0].sql, "BEGIN");
  assert.equal(client.statements.at(-1).sql, "COMMIT");
  assert.equal(client.statements.filter((s) => s.sql.startsWith("INSERT INTO public.schema_migrations")).length, migrations.length);
});

test("migrations are skipped when correct checksums are already stored", async () => {
  const migrations = await listMigrations();
  const client = mockClient(migrations.map(({ name, checksum }) => ({ filename: name, checksum })));
  const result = await runMigrations(client, migrations);
  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped, migrations.length);
});

test("changed migration checksums cause rollback before applying SQL", async () => {
  const migrations = await listMigrations();
  const client = mockClient([{ filename: migrations[0].name, checksum: "wrong" }]);
  await assert.rejects(runMigrations(client, migrations), /checksum mismatch/);
  assert.equal(client.statements.at(-1).sql, "ROLLBACK");
});

test("missing historical migration causes rollback", async () => {
  const migrations = await listMigrations();
  const client = mockClient([{ filename: "0000_missing.sql", checksum: "x" }]);
  await assert.rejects(runMigrations(client, migrations), /missing/);
  assert.equal(client.statements.at(-1).sql, "ROLLBACK");
});
