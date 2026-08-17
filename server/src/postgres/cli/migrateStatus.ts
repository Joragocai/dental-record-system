import { buildPgFoundationConfig, formatPgTarget } from "../config.js";
import { formatMigrationStatusLines, getMigrationStatus } from "../migrations.js";
import { createPgPoolManager } from "../pool.js";

async function main() {
  const config = buildPgFoundationConfig();
  const pool = createPgPoolManager(config);

  try {
    console.log(`[db] Target: ${formatPgTarget(pool.describeTarget())}`);
    const statuses = await getMigrationStatus(pool);
    for (const line of formatMigrationStatusLines(statuses)) {
      console.log(line);
    }
  } finally {
    await pool.shutdown();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db] Migration status failed: ${message}`);
  process.exitCode = 1;
});
