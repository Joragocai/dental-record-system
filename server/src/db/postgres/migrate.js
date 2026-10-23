import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getPostgresPool } from "./pool.js";

export const migrationDirectory = fileURLToPath(new URL("./migrations/", import.meta.url));
const migrationPattern = /^[0-9]{4}_[a-z][a-z0-9_]*\.sql$/;
const migrationLock = [2026, 1023];

export async function listMigrations(directory = migrationDirectory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of names) {
    if (!migrationPattern.test(name)) throw new Error(`Invalid migration filename: ${name}`);
  }
  const unique = new Set();
  return Promise.all(names.map(async (name) => {
    const sequence = name.slice(0, 4);
    if (unique.has(sequence)) throw new Error(`Duplicate migration sequence: ${sequence}`);
    unique.add(sequence);
    const sql = await readFile(path.join(directory, name), "utf8");
    if (!sql.trim()) throw new Error(`Empty migration: ${name}`);
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
}

export async function runMigrations(client, migrations) {
  await client.query("BEGIN");
  try {
    // Serialize concurrent deploy/migration attempts until transaction completes.
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", migrationLock);
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const applied = await client.query("SELECT filename, checksum FROM public.schema_migrations ORDER BY filename");
    const known = new Map(applied.rows.map((row) => [row.filename, row.checksum]));
    const currentNames = new Set(migrations.map((item) => item.name));
    for (const [filename, checksum] of known) {
      if (!currentNames.has(filename)) throw new Error(`Applied migration file missing: ${filename}`);
      if (migrations.find((item) => item.name === filename)?.checksum !== checksum) {
        throw new Error(`Applied migration checksum mismatch: ${filename}`);
      }
    }
    const pending = migrations.filter((item) => !known.has(item.name));
    const maxApplied = [...known.keys()].sort().at(-1);
    if (pending.length && maxApplied && pending[0].name < maxApplied) {
      throw new Error("Cannot add an earlier migration after newer migrations have been applied.");
    }
    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query("INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1, $2)", [migration.name, migration.checksum]);
    }
    await client.query("COMMIT");
    return { applied: pending.map((item) => item.name), skipped: migrations.length - pending.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function migrate({ pool = null, directory = migrationDirectory } = {}) {
  const migrations = await listMigrations(directory);
  const actualPool = pool || await getPostgresPool();
  const client = await actualPool.connect();
  try {
    return await runMigrations(client, migrations);
  } finally {
    client.release();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = await migrate();
    console.log("PostgreSQL migrations:", result);
    const pool = await getPostgresPool();
    await pool.end();
  } catch (error) {
    console.error("PostgreSQL migration failed:", error.message);
    process.exitCode = 1;
    // Explicitly terminate the pool if initialization succeeded.
    if (process.env.DATABASE_URL) {
      try {
        const pool = await getPostgresPool();
        await pool.end();
      } catch {}
    }
  }
}
