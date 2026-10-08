import path from "node:path";
import { assertSupabaseDatabaseIdentity } from "../../config/hostedSafety.js";
import { pathToFileURL } from "node:url";
import {
  assertPgMutationAllowed,
  buildPgFoundationConfig,
  formatPgTarget,
  type PgFoundationConfig
} from "../config.js";
import { runPendingMigrations } from "../migrations.js";
import { createPgPoolManager, type PgPoolManager } from "../pool.js";

export interface PgMigrationCommandOptions {
  config?: PgFoundationConfig;
  createPoolManager?: (config: PgFoundationConfig) => PgPoolManager;
  log?: (message: string) => void;
}

export async function runPgMigrationCommand(options: PgMigrationCommandOptions = {}) {
  const config = options.config ?? buildPgFoundationConfig();
  assertPgMutationAllowed(config);
  if (config.appEnv === "staging") {
    assertSupabaseDatabaseIdentity(config.databaseUrl, process.env.SUPABASE_URL ?? "");
  }

  const createPoolManager = options.createPoolManager ?? createPgPoolManager;
  const log = options.log ?? console.log;
  const pool = createPoolManager(config);

  try {
    log(`[db] Target: ${formatPgTarget(pool.describeTarget())}`);
    const result = await runPendingMigrations(pool);
    log(`[db] Applied migrations: ${result.applied.length}`);
    log(`[db] Skipped migrations: ${result.skipped.length}`);
  } finally {
    await pool.shutdown();
  }
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }

  return import.meta.url === pathToFileURL(path.resolve(entrypoint)).href;
}

if (isDirectExecution()) {
  runPgMigrationCommand().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[db] Migration failed: ${message}`);
    process.exitCode = 1;
  });
}
