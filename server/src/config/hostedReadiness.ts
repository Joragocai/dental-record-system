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
      // Readiness is intentionally bounded to one shared database connection.
      // Keep the configured connection/statement timeouts instead of forcing a
      // 2-second cross-region limit that can reject a healthy hosted database.
      maxPoolSize: 1
    });
  }
  return readinessPool;
}

export function classifyReadinessFailure(error: unknown): string {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code.toUpperCase() : "";
  const message = typeof candidate?.message === "string" ? candidate.message.toLowerCase() : "";

  if (code === "28P01") return "database-authentication";
  if (code === "ENOENT" || message.includes("ca_file") || message.includes("certificate path")) {
    return "ca-file";
  }
  if (
    ["ECONNREFUSED", "ETIMEDOUT", "ENETUNREACH", "EAI_AGAIN", "ENOTFOUND"].includes(code)
  ) {
    return "database-network";
  }
  if (
    message.includes("certificate") ||
    message.includes("self-signed") ||
    message.includes("tls") ||
    message.includes("ssl")
  ) {
    return "database-tls";
  }
  return "database-readiness";
}

/** Read-only readiness: one shared, one-connection pool and checked migrations. */
export const checkHostedReadiness = createCachedReadinessChecker(async () => {
  try {
    const pool = getReadinessPool();
    await pool.query("SELECT 1");
    const migrations = await getMigrationStatus(pool);
    return migrations.length > 0 &&
      migrations.every((item) => item.applied && item.checksumMatches && !item.isOrphaned);
  } catch (error) {
    // Never log URLs, credentials, provider responses, or raw error messages.
    console.error(`[readiness] probe failed category=${classifyReadinessFailure(error)}`);
    return false;
  }
});
