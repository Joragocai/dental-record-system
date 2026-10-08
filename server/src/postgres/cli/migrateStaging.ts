import { buildPgFoundationConfig } from "../config.js";
import { runPgMigrationCommand } from "./migrate.js";

// Explicit staging-only entrypoint; never permit a production environment to
// be reached by an accidental switch of the ignored staging .env file.
async function main(): Promise<void> {
  if (process.env.DENTAL_SERVER_ENV !== "staging") {
    throw new Error("Staging migration refused: DENTAL_SERVER_ENV must be staging.");
  }
  if (process.env.ALLOW_PRODUCTION_DB_COMMANDS !== "true") {
    throw new Error("Staging migration requires explicit one-command ALLOW_PRODUCTION_DB_COMMANDS=true.");
  }

  const config = buildPgFoundationConfig();
  if (config.appEnv !== "staging" || config.sslMode !== "require") {
    throw new Error("Staging migration refused: expected a staging PostgreSQL target using verified TLS.");
  }
  await runPgMigrationCommand({ config });
}

main().catch((error: unknown) => {
  const safe = error instanceof Error ? error.message : "Unknown migration failure.";
  console.error(`[db] Staging migration failed: ${safe}`);
  process.exitCode = 1;
});
