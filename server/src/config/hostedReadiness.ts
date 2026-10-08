import { buildPgFoundationConfig } from "../postgres/config.js";
import { createPgPoolManager, type PgPoolManager } from "../postgres/pool.js";
import { getMigrationStatus } from "../postgres/migrations.js";

// Render needs a fast readiness response; a public request must not create
// a new connection pool or start an unbounded number of database checks.
const successfulProbeTtlMs = 15_000;
const failedProbeTtlMs = 5_000;

export interface ReadinessCacheOptions {
  now?: () => number;
  successTtlMs?: number;
  failureTtlMs?: number;
}

/**
 * Coalesce concurrent callers, and cache both success and failure briefly.
 * Failed probes return false without exposing database or configuration errors.
 */
export function createCachedReadinessChecker(
  probe: () => Promise<boolean>,
  options: ReadinessCacheOptions = {}
): () => Promise<boolean> {
  const now = options.now ?? Date.now;
  const successTtlMs = options.successTtlMs ?? successfulProbeTtlMs;
  const failureTtlMs = options.failureTtlMs ?? failedProbeTtlMs;
  if (
    !Number.isFinite(successTtlMs) || successTtlMs < 1 ||
    !Number.isFinite(failureTtlMs) || failureTtlMs < 1
  ) {
    throw new Error("Readiness cache TTLs must be positive.");
  }

  let expiresAt = Number.NEGATIVE_INFINITY;
  let lastResult = false;
  let pending: Promise<boolean> | null = null;

  return function check(): Promise<boolean> {
    if (pending) return pending;
    if (now() < expiresAt) return Promise.resolve(lastResult);

    pending = (async () => {
      let result = false;
      try {
        result = (await probe()) === true;
      } catch {
        result = false;
      } finally {
        lastResult = result;
        expiresAt = now() + (result ? successTtlMs : failureTtlMs);
      }
      return result;
    })().finally(() => {
      pending = null;
    });
    return pending;
  };
}

let readinessPool: PgPoolManager | null = null;

function getReadinessPool(): PgPoolManager {
  if (!readinessPool) {
    const config = buildPgFoundationConfig();
    readinessPool = createPgPoolManager({
      ...config,
      maxPoolSize: 1,
      connectionTimeoutMs: Math.min(config.connectionTimeoutMs, 2_000),
      statementTimeoutMs: Math.min(config.statementTimeoutMs, 2_000)
    });
  }
  return readinessPool;
}

/** Read-only readiness: one shared, one-connection pool and checked migrations. */
export const checkHostedReadiness = createCachedReadinessChecker(async () => {
  const pool = getReadinessPool();
  await pool.query("SELECT 1");
  const migrations = await getMigrationStatus(pool);
  return migrations.length > 0 &&
    migrations.every((item) => item.applied && item.checksumMatches && !item.isOrphaned);
});
