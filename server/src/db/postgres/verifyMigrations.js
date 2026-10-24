import { listMigrations } from "./migrate.js";

// Read-only deployment gate. Migrations must be applied separately through
// a controlled process, not automatically during an API server startup.
export async function verifyPostgresMigrations(pool, migrations = null) {
  const expected = migrations || await listMigrations();
  let rows;
  try {
    ({rows} = await pool.query(
      "SELECT filename, checksum FROM public.schema_migrations ORDER BY filename"
    ));
  } catch {
    throw new Error("PostgreSQL migrations are missing or not accessible. Do not start the cloud API.");
  }
  const recorded = new Map(rows.map(({filename, checksum}) => [filename, checksum]));
  if (recorded.size !== expected.length) {
    throw new Error("PostgreSQL migration count differs from the deployed application. Apply or reconcile migrations before starting.");
  }
  for (const {name, checksum} of expected) {
    if (recorded.get(name) !== checksum) {
      throw new Error(`PostgreSQL migration not ready: ${name}. Check deployment and migration history.`);
    }
  }
  return { verified: expected.length };
}
