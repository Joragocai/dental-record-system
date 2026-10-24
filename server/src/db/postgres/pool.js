// PostgreSQL pool is deliberately initialized only when cloud mode is configured.
// Existing SQLite demo mode remains unchanged during the phased migration.
const poolOptions = {
  max: 10,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
};

export function getPostgresConfig(env = process.env) {
  const connectionString = String(env.DATABASE_URL || "").trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL mode.");
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    throw new Error("DATABASE_URL must use a PostgreSQL connection URL.");
  }
  const mode = String(env.NODE_ENV || "development");
  const tls = String(env.PG_SSL_MODE || (mode === "production" ? "require" : "prefer")).toLowerCase();
  if (!["require", "disable", "prefer"].includes(tls)) {
    throw new Error("PG_SSL_MODE must be require, prefer, or disable.");
  }
  // Remote providers normally require TLS. Never bypass certificate validation.
  if (mode === "production" && tls !== "require") {
    throw new Error("Production PostgreSQL connections require PG_SSL_MODE=require.");
  }
  const ca = String(env.PG_CA_CERT_PEM || "").trim();
  if (ca && !ca.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error("PG_CA_CERT_PEM must contain a PEM certificate.");
  }
  return {
    connectionString,
    ...poolOptions,
    ssl: tls === "disable" ? false : { rejectUnauthorized: true, ...(ca ? { ca: ca.replace(/\\n/g, "\n") } : {}) }
  };
}

export function getPostgresDateTypeParser(pg) {
  return { getTypeParser(oid, format) {
    if (oid === 1082 && (!format || format === "text")) return value => value;
    return pg.types.getTypeParser(oid, format);
  } };
}

let poolPromise;
export function getPostgresPool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      const config = getPostgresConfig();
      const { default: pg } = await import("pg");
      // PostgreSQL DATE is a calendar day, not a timestamp. Keep the raw
      // YYYY-MM-DD text to prevent the Node timezone from shifting the day.
      return new pg.Pool({ ...config, types: getPostgresDateTypeParser(pg) });
    })().catch((error) => {
      poolPromise = undefined;
      throw error;
    });
  }
  return poolPromise;
}

export async function withPostgresTransaction(callback, pool = null) {
  const activePool = pool || await getPostgresPool();
  const client = await activePool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
}
