import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { QueryResultRow } from "pg";

export interface MigrationFile {
  id: string;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigrationRecord {
  name: string;
  checksum: string;
  appliedAt: string;
}

export interface MigrationStatus {
  name: string;
  filename: string;
  checksum: string;
  applied: boolean;
  appliedAt: string | null;
  checksumMatches: boolean;
  isOrphaned: boolean;
}

export interface PgMigrationExecutor {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: R[] }>;
}

export interface PgMigrationRunner extends PgMigrationExecutor {
  withTransaction<T>(callback: (executor: PgMigrationExecutor) => Promise<T>): Promise<T>;
}

export interface MigrationRunResult {
  applied: string[];
  skipped: string[];
}

export const migrationTableName = "drs_schema_migrations";

const migrationFilePattern = /^(?<id>\d{4})_(?<slug>[a-z0-9][a-z0-9_-]*)\.sql$/;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultMigrationsDir = path.join(currentDir, "migrations");

function buildMigrationChecksum(sql: string): string {
  return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

export function getDefaultMigrationsDirectory(): string {
  return defaultMigrationsDir;
}

export function buildCreateMigrationTableSql(tableName = migrationTableName): string {
  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

export async function listMigrationFiles(migrationsDir = defaultMigrationsDir): Promise<MigrationFile[]> {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  const migrations: MigrationFile[] = [];

  for (const filename of files) {
    const match = filename.match(migrationFilePattern);
    if (!match?.groups) {
      throw new Error(`Migration file names must use NNNN_description.sql: ${filename}`);
    }

    if (seenNames.has(filename)) {
      throw new Error(`Duplicate migration file detected: ${filename}`);
    }

    if (seenIds.has(match.groups.id)) {
      throw new Error(`Duplicate migration numeric prefix detected: ${match.groups.id}`);
    }

    const absolutePath = path.join(migrationsDir, filename);
    const sql = await fs.readFile(absolutePath, "utf8");
    if (!sql.trim()) {
      throw new Error(`Migration files must not be empty: ${filename}`);
    }

    seenNames.add(filename);
    seenIds.add(match.groups.id);
    migrations.push({
      id: match.groups.id,
      name: filename,
      filename,
      sql,
      checksum: buildMigrationChecksum(sql)
    });
  }

  return migrations;
}

export async function getAppliedMigrations(
  executor: PgMigrationExecutor,
  tableName = migrationTableName,
  options: {
    ensureTable?: boolean;
  } = {}
): Promise<AppliedMigrationRecord[]> {
  const ensureTable = options.ensureTable ?? true;

  if (ensureTable) {
    await executor.query(buildCreateMigrationTableSql(tableName));
  } else {
    const existenceResult = await executor.query<{ relation_name: string | null }>(
      "SELECT to_regclass($1) AS relation_name",
      [tableName]
    );
    if (!existenceResult.rows[0]?.relation_name) {
      return [];
    }
  }

  const result = await executor.query<{
    name: string;
    checksum: string;
    applied_at: string | Date;
  }>(`SELECT name, checksum, applied_at FROM ${tableName} ORDER BY name ASC`);

  return result.rows.map((row) => ({
    name: String(row.name),
    checksum: String(row.checksum),
    appliedAt: row.applied_at instanceof Date ? row.applied_at.toISOString() : String(row.applied_at)
  }));
}

export function compareMigrationState(
  availableMigrations: readonly MigrationFile[],
  appliedMigrations: readonly AppliedMigrationRecord[]
): MigrationStatus[] {
  const availableByName = new Map(availableMigrations.map((migration) => [migration.name, migration]));
  const appliedByName = new Map(appliedMigrations.map((migration) => [migration.name, migration]));
  const statuses: MigrationStatus[] = availableMigrations.map((migration) => {
    const applied = appliedByName.get(migration.name);
    return {
      name: migration.name,
      filename: migration.filename,
      checksum: migration.checksum,
      applied: Boolean(applied),
      appliedAt: applied ? applied.appliedAt : null,
      checksumMatches: applied ? applied.checksum === migration.checksum : true,
      isOrphaned: false
    };
  });

  for (const applied of appliedMigrations) {
    if (availableByName.has(applied.name)) {
      continue;
    }

    statuses.push({
      name: applied.name,
      filename: applied.name,
      checksum: applied.checksum,
      applied: true,
      appliedAt: applied.appliedAt,
      checksumMatches: false,
      isOrphaned: true
    });
  }

  return statuses.sort((left, right) => left.name.localeCompare(right.name));
}

export async function getMigrationStatus(
  executor: PgMigrationExecutor,
  migrationsDir = defaultMigrationsDir,
  tableName = migrationTableName
): Promise<MigrationStatus[]> {
  const [available, applied] = await Promise.all([
    listMigrationFiles(migrationsDir),
    getAppliedMigrations(executor, tableName, { ensureTable: false })
  ]);

  return compareMigrationState(available, applied);
}

export async function runPendingMigrations(
  runner: PgMigrationRunner,
  migrationsDir = defaultMigrationsDir,
  tableName = migrationTableName
): Promise<MigrationRunResult> {
  const migrations = await listMigrationFiles(migrationsDir);
  return runPendingMigrationsFromList(runner, migrations, tableName);
}

export async function runPendingMigrationsFromList(
  runner: PgMigrationRunner,
  migrations: readonly MigrationFile[],
  tableName = migrationTableName
): Promise<MigrationRunResult> {
  await runner.query(buildCreateMigrationTableSql(tableName));
  const applied = await getAppliedMigrations(runner, tableName);
  const appliedByName = new Map(applied.map((migration) => [migration.name, migration]));
  const result: MigrationRunResult = {
    applied: [],
    skipped: []
  };

  for (const migration of migrations) {
    const appliedMigration = appliedByName.get(migration.name);
    if (appliedMigration) {
      if (appliedMigration.checksum !== migration.checksum) {
        throw new Error(`Applied migration checksum mismatch: ${migration.name}`);
      }

      result.skipped.push(migration.name);
      continue;
    }

    await runner.withTransaction(async (executor) => {
      await executor.query(migration.sql);
      await executor.query(
        `INSERT INTO ${tableName} (name, checksum, applied_at) VALUES ($1, $2, NOW())`,
        [migration.name, migration.checksum]
      );
    });
    result.applied.push(migration.name);
  }

  return result;
}

export function formatMigrationStatusLines(statuses: readonly MigrationStatus[]): string[] {
  if (statuses.length === 0) {
    return ["[db] No PostgreSQL migration files were found."];
  }

  return statuses.map((status) => {
    const state = status.isOrphaned
      ? "ORPHANED"
      : status.applied
        ? status.checksumMatches
          ? "APPLIED"
          : "CHECKSUM_MISMATCH"
        : "PENDING";

    const appliedAtSegment = status.appliedAt ? ` applied_at=${status.appliedAt}` : "";
    return `[db] ${state} ${status.name}${appliedAtSegment}`;
  });
}
