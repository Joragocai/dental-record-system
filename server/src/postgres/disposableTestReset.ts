import type { PgPoolManager } from "./pool.js";
import { buildPgFoundationConfig, getDatabaseNameFromUrl, parsePostgresUrl } from "./config.js";
import { assertSafeTestDatabaseTarget } from "./testSafety.js";

/**
 * Only for sequential integration tests on the explicitly designated disposable
 * local sandbox. Never import this into application code or migration CLIs.
 */
export async function resetDisposableTestTables(pool: PgPoolManager): Promise<void> {
  const config = buildPgFoundationConfig(process.env);
  if (!config.testDatabaseUrl) throw new Error("Missing TEST_DATABASE_URL.");
  assertSafeTestDatabaseTarget(config.testDatabaseUrl, config.databaseUrl, config.appEnv);
  const target = parsePostgresUrl(config.testDatabaseUrl, "TEST_DATABASE_URL");
  if (target.hostname !== "127.0.0.1" && target.hostname !== "localhost") {
    throw new Error("Refusing test cleanup outside loopback.");
  }
  if (getDatabaseNameFromUrl(target) !== "dental_test_sandbox" || config.sslMode !== "disable") {
    throw new Error("Refusing test cleanup outside the approved dental_test_sandbox.");
  }
  const identity = await pool.query<{ db: string; address: string | null }>(
    "SELECT current_database() AS db, host(inet_server_addr()) AS address"
  );
  const row = identity.rows[0];
  if (row?.db !== "dental_test_sandbox" ||
      (row.address !== null && row.address !== "127.0.0.1" && row.address !== "::1")) {
    throw new Error("PostgreSQL server/database identity does not match the disposable test target.");
  }
  const tables = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  for (const { tablename } of tables.rows) {
    if (!/^[a-z_][a-z0-9_]*$/.test(tablename)) {
      throw new Error("Unsafe public test table identifier.");
    }
    await pool.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
  }
}
