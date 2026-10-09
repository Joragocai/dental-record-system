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

  assert.equal(migrations.length, 12);
  assert.equal(migrations[0]?.name, "0001_v2_foundation_probe.sql");
  assert.equal(migrations[1]?.name, "0002_branch_patient_core.sql");
  assert.equal(migrations[2]?.name, "0003_treatment_core.sql");
  assert.equal(migrations[3]?.name, "0004_appointment_core.sql");
  assert.equal(migrations[4]?.name, "0005_application_user_access_foundation.sql");
  assert.equal(migrations[5]?.name, "0006_authorization_rbac_foundation.sql");
  assert.equal(migrations[6]?.name, "0007_append_only_audit_foundation.sql");
  assert.equal(migrations[7]?.name, "0008_treatment_branch_context.sql");
  assert.equal(migrations[8]?.name, "0009_audit_review_request_correlation.sql");
  assert.equal(migrations[9]?.name, "0010_private_attachment_storage.sql");
  assert.equal(migrations[10]?.name, "0011_appointment_workflow_redesign.sql");
  assert.equal(migrations[11]?.name, "0012_notification_foundation.sql");
  for (const migration of migrations) assert.equal(migration.checksum.length, 64);

  const treatmentBranchMigration = migrations[7]?.sql ?? "";
  assert.match(treatmentBranchMigration, /ADD COLUMN IF NOT EXISTS branch_id UUID/);
  assert.match(treatmentBranchMigration, /SET branch_id = p\.branch_id/);
  assert.match(treatmentBranchMigration, /ALTER COLUMN branch_id SET NOT NULL/);
  assert.match(treatmentBranchMigration, /REFERENCES branches\(id\) ON DELETE RESTRICT/);

  const auditReviewMigration = migrations[8]?.sql ?? "";
  assert.match(auditReviewMigration, /ADD COLUMN IF NOT EXISTS request_id UUID/);
  assert.match(auditReviewMigration, /'audit\.read'/);
  assert.match(auditReviewMigration, /'audit\.export'/);
  assert.match(auditReviewMigration, /CLINIC_ADMINISTRATOR/);

  const attachmentMigration = migrations[9]?.sql ?? "";
  assert.match(attachmentMigration, /CREATE TABLE IF NOT EXISTS attachments/);
  assert.match(attachmentMigration, /treatments_id_patient_branch_unique/);
  assert.match(attachmentMigration, /attachment\.create/);
  assert.match(attachmentMigration, /attachment\.delete/);
  assert.match(attachmentMigration, /r\.code = 'PERSONNEL'/);
  assert.match(attachmentMigration, /r\.code = 'DENTIST'/);

  const appointmentWorkflowMigration = migrations[10]?.sql ?? "";
  assert.match(appointmentWorkflowMigration, /WHEN 'Scheduled' THEN 'confirmed'/);
  assert.match(appointmentWorkflowMigration, /CREATE TABLE IF NOT EXISTS appointment_history/);
  assert.match(appointmentWorkflowMigration, /appointment_history is append-only/);
  assert.match(appointmentWorkflowMigration, /appointment\.patient_lookup/);
  assert.match(appointmentWorkflowMigration, /appointment\.start/);
  assert.match(appointmentWorkflowMigration, /appointment\.complete/);
  assert.match(appointmentWorkflowMigration, /appointment\.no_show/);
  assert.match(appointmentWorkflowMigration, /r\.code = 'PERSONNEL'/);
  assert.match(appointmentWorkflowMigration, /r\.code = 'DENTIST'/);

  const notificationMigration = migrations[11]?.sql ?? "";
  assert.match(notificationMigration, /CREATE TABLE IF NOT EXISTS notifications/);
  assert.match(notificationMigration, /CREATE TABLE IF NOT EXISTS notification_preferences/);
  assert.match(notificationMigration, /CREATE TABLE IF NOT EXISTS email_delivery_logs/);
  assert.match(notificationMigration, /email_delivery_logs_exactly_one_recipient/);
  assert.match(notificationMigration, /dedupe_key TEXT NOT NULL UNIQUE/);
  assert.match(notificationMigration, /status IN \('pending', 'processing', 'failed', 'sent', 'abandoned'\)/);
  assert.doesNotMatch(notificationMigration, /sms/i);
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
  const expectedNames = migrations.map((migration) => migration.name);

  const firstRun = await runPendingMigrationsFromList(runner, migrations, migrationTableName);
  assert.deepEqual(firstRun.applied, expectedNames);
  assert.deepEqual(runner.listAppliedMigrationNames(), expectedNames);

  const secondRun = await runPendingMigrationsFromList(runner, migrations, migrationTableName);
  assert.deepEqual(secondRun.applied, []);
  assert.deepEqual(secondRun.skipped, expectedNames);
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

  assert.equal(statuses.length, 12);
  for (const status of statuses) assert.equal(status.applied, false);
  assert.equal(
    runner.executedSql.some((statement) => statement.startsWith(`CREATE TABLE IF NOT EXISTS ${migrationTableName}`)),
    false
  );
});
