import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResultRow } from "pg";
import {
  compareMigrationState,
  getMigrationStatus,
  listMigrationFiles,
  migrationTableName,
  runPendingMigrationsFromList,
  type AppliedMigrationRecord,
  type MigrationFile,
  type PgMigrationExecutor,
  type PgMigrationRunner
} from "./migrations.js";

class FakeMigrationRunner implements PgMigrationRunner {
  private applied = new Map<string, AppliedMigrationRecord>();
  readonly executedSql: string[] = [];
  failOnSqlFragment: string | null = null;

  seedAppliedMigration(record: AppliedMigrationRecord): void {
    this.applied.set(record.name, record);
  }

  listAppliedMigrationNames(): string[] {
    return [...this.applied.keys()].sort((left, right) => left.localeCompare(right));
  }

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: R[] }>;
  async query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }> {
    const normalized = text.trim();
    this.executedSql.push(normalized);

    if (normalized.startsWith(`CREATE TABLE IF NOT EXISTS ${migrationTableName}`)) {
      return { rows: [] };
    }

    if (normalized.startsWith("SELECT name, checksum, applied_at FROM")) {
      return {
        rows: [...this.applied.values()].map((record) => ({
          name: record.name,
          checksum: record.checksum,
          applied_at: record.appliedAt
        }))
      };
    }

    if (normalized === "SELECT to_regclass($1) AS relation_name") {
      return {
        rows: [
          {
            relation_name: this.applied.size > 0 ? migrationTableName : null
          }
        ]
      };
    }

    if (normalized.startsWith("INSERT INTO") && values) {
      const [name, checksum] = values;
      this.applied.set(String(name), {
        name: String(name),
        checksum: String(checksum),
        appliedAt: "2026-08-17T00:00:00.000Z"
      });
      return { rows: [] };
    }

    if (this.failOnSqlFragment && normalized.includes(this.failOnSqlFragment)) {
      throw new Error("forced migration failure");
    }

    return { rows: [] };
  }

  async withTransaction<T>(callback: (executor: PgMigrationExecutor) => Promise<T>): Promise<T> {
    const snapshot = new Map(this.applied);

    try {
      return await callback(this);
    } catch (error) {
      this.applied = snapshot;
      throw error;
    }
  }
}

test("listMigrationFiles returns ordered SQL migrations with checksums", async () => {
  const migrations = await listMigrationFiles();

  assert.equal(migrations.length, 6);
  assert.equal(migrations[0]?.name, "0001_v2_foundation_probe.sql");
  assert.equal(migrations[1]?.name, "0002_branch_patient_core.sql");
  assert.equal(migrations[2]?.name, "0003_treatment_core.sql");
  assert.equal(migrations[3]?.name, "0004_appointment_core.sql");
  assert.equal(migrations[4]?.name, "0005_application_user_access_foundation.sql");
  assert.equal(migrations[5]?.name, "0006_authorization_rbac_foundation.sql");
  assert.equal(migrations[0]?.checksum.length, 64);
  assert.equal(migrations[1]?.checksum.length, 64);
  assert.equal(migrations[2]?.checksum.length, 64);
  assert.equal(migrations[3]?.checksum.length, 64);
  assert.equal(migrations[4]?.checksum.length, 64);
  assert.equal(migrations[5]?.checksum.length, 64);
});

test("compareMigrationState reports pending, applied, and orphaned migrations", () => {
  const available: MigrationFile[] = [
    {
      id: "0001",
      name: "0001_v2_foundation_probe.sql",
      filename: "0001_v2_foundation_probe.sql",
      sql: "SELECT 1;",
      checksum: "a".repeat(64)
    }
  ];
  const applied: AppliedMigrationRecord[] = [
    {
      name: "0001_v2_foundation_probe.sql",
      checksum: "a".repeat(64),
      appliedAt: "2026-08-17T00:00:00.000Z"
    },
    {
      name: "0002_missing.sql",
      checksum: "b".repeat(64),
      appliedAt: "2026-08-17T00:01:00.000Z"
    }
  ];

  const statuses = compareMigrationState(available, applied);

  assert.equal(statuses.length, 2);
  assert.equal(statuses[0]?.name, "0001_v2_foundation_probe.sql");
  assert.equal(statuses[0]?.applied, true);
  assert.equal(statuses[0]?.checksumMatches, true);
  assert.equal(statuses[1]?.name, "0002_missing.sql");
  assert.equal(statuses[1]?.isOrphaned, true);
});

test("runPendingMigrationsFromList records applied migrations and skips reruns", async () => {
  const migrations = await listMigrationFiles();
  const runner = new FakeMigrationRunner();

  const firstRun = await runPendingMigrationsFromList(runner, migrations, migrationTableName);
  assert.deepEqual(firstRun.applied, [
    "0001_v2_foundation_probe.sql",
    "0002_branch_patient_core.sql",
    "0003_treatment_core.sql",
    "0004_appointment_core.sql",
    "0005_application_user_access_foundation.sql",
    "0006_authorization_rbac_foundation.sql"
  ]);
  assert.deepEqual(runner.listAppliedMigrationNames(), [
    "0001_v2_foundation_probe.sql",
    "0002_branch_patient_core.sql",
    "0003_treatment_core.sql",
    "0004_appointment_core.sql",
    "0005_application_user_access_foundation.sql",
    "0006_authorization_rbac_foundation.sql"
  ]);

  const secondRun = await runPendingMigrationsFromList(runner, migrations, migrationTableName);
  assert.deepEqual(secondRun.applied, []);
  assert.deepEqual(secondRun.skipped, [
    "0001_v2_foundation_probe.sql",
    "0002_branch_patient_core.sql",
    "0003_treatment_core.sql",
    "0004_appointment_core.sql",
    "0005_application_user_access_foundation.sql",
    "0006_authorization_rbac_foundation.sql"
  ]);
});

test("runPendingMigrationsFromList rejects checksum drift", async () => {
  const migrations = await listMigrationFiles();
  const runner = new FakeMigrationRunner();

  runner.seedAppliedMigration({
    name: "0001_v2_foundation_probe.sql",
    checksum: "f".repeat(64),
    appliedAt: "2026-08-17T00:00:00.000Z"
  });

  await assert.rejects(
    async () => runPendingMigrationsFromList(runner, migrations, migrationTableName),
    /checksum mismatch/i
  );
});

test("runPendingMigrationsFromList does not mark failed migrations as applied", async () => {
  const migrations = await listMigrationFiles();
  const runner = new FakeMigrationRunner();
  runner.failOnSqlFragment = "drs_v2_foundation_probe";

  await assert.rejects(
    async () => runPendingMigrationsFromList(runner, migrations, migrationTableName),
    /forced migration failure/
  );

  assert.deepEqual(runner.listAppliedMigrationNames(), []);
});

test("getMigrationStatus remains read-only when the migration table is absent", async () => {
  const runner = new FakeMigrationRunner();

  const statuses = await getMigrationStatus(runner);

  assert.equal(statuses.length, 6);
  assert.equal(statuses[0]?.applied, false);
  assert.equal(statuses[1]?.applied, false);
  assert.equal(statuses[2]?.applied, false);
  assert.equal(statuses[3]?.applied, false);
  assert.equal(statuses[4]?.applied, false);
  assert.equal(statuses[5]?.applied, false);
  assert.equal(
    runner.executedSql.some((statement) => statement.startsWith(`CREATE TABLE IF NOT EXISTS ${migrationTableName}`)),
    false
  );
});
