import { readFileSync } from "node:fs";
import type { PoolConfig } from "pg";

export type PgAppEnv = "local" | "test" | "staging" | "production";
export type PgSslMode = "disable" | "require" | "no-verify";

export interface PgConnectionSummary {
  appEnv: PgAppEnv;
  host: string;
  port: number | null;
  database: string;
  username: string;
  sslMode: PgSslMode;
}

export interface PgFoundationConfig extends PgConnectionSummary {
  databaseUrl: string;
  testDatabaseUrl: string | null;
  maxPoolSize: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
  applicationName: string;
  allowProductionCommands: boolean;
  sslCaFile?: string | null;
}

const allowedAppEnvs: readonly PgAppEnv[] = ["local", "test", "staging", "production"];
const allowedSslModes: readonly PgSslMode[] = ["disable", "require", "no-verify"];

function parseEnumValue<T extends string>(
  rawValue: string | undefined,
  allowedValues: readonly T[],
  fallbackValue: T,
  label: string
): T {
  if (rawValue === undefined || String(rawValue).trim() === "") {
    return fallbackValue;
  }

  const normalized = String(rawValue).trim().toLowerCase() as T;
  if (allowedValues.includes(normalized)) {
    return normalized;
  }

  throw new Error(`${label} must be one of: ${allowedValues.join(", ")}.`);
}

function parseBooleanValue(rawValue: string | undefined, fallbackValue: boolean): boolean {
  if (rawValue === undefined || String(rawValue).trim() === "") {
    return fallbackValue;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  throw new Error("Boolean configuration values must be true/false, yes/no, on/off, or 1/0.");
}

function parsePositiveInteger(rawValue: string | undefined, fallbackValue: number, label: string): number {
  if (rawValue === undefined || String(rawValue).trim() === "") {
    return fallbackValue;
  }

  const parsed = Number.parseInt(String(rawValue).trim(), 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new Error(`${label} must be a positive integer.`);
}

export function getPgAppEnv(env: NodeJS.ProcessEnv = process.env): PgAppEnv {
  return parseEnumValue(env.DENTAL_SERVER_ENV, allowedAppEnvs, "local", "DENTAL_SERVER_ENV");
}

export function getDefaultPgSslMode(appEnv: PgAppEnv): PgSslMode {
  if (appEnv === "staging" || appEnv === "production") {
    return "require";
  }

  return "disable";
}

export function parsePostgresUrl(rawValue: string | undefined, label: string): URL {
  if (rawValue === undefined || String(rawValue).trim() === "") {
    throw new Error(`${label} is required.`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(String(rawValue).trim());
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL connection URL.`);
  }

  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new Error(`${label} must use the postgres:// or postgresql:// protocol.`);
  }

  if (!parsedUrl.hostname) {
    throw new Error(`${label} must include a host name.`);
  }

  if (!getDatabaseNameFromUrl(parsedUrl)) {
    throw new Error(`${label} must include a database name.`);
  }

  return parsedUrl;
}

export function getDatabaseNameFromUrl(databaseUrl: URL): string {
  return databaseUrl.pathname.replace(/^\/+/, "").trim();
}

export function summarizeDatabaseUrl(
  databaseUrl: string,
  sslMode: PgSslMode,
  appEnv: PgAppEnv = getPgAppEnv()
): PgConnectionSummary {
  const parsedUrl = parsePostgresUrl(databaseUrl, "DATABASE_URL");
  return {
    appEnv,
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : null,
    database: getDatabaseNameFromUrl(parsedUrl),
    username: decodeURIComponent(parsedUrl.username || ""),
    sslMode
  };
}

export function formatPgTarget(summary: PgConnectionSummary): string {
  const portSegment = summary.port ? `:${summary.port}` : "";
  return `${summary.appEnv} postgresql://${summary.host}${portSegment}/${summary.database}?ssl=${summary.sslMode}`;
}

export function isProductionLikePgTarget(appEnv: PgAppEnv): boolean {
  return appEnv === "staging" || appEnv === "production";
}

export function assertPgMutationAllowed(config: PgFoundationConfig): void {
  if (!isProductionLikePgTarget(config.appEnv) || config.allowProductionCommands) {
    return;
  }

  throw new Error(
    `Refusing to run mutating PostgreSQL commands against the ${config.appEnv} target without ALLOW_PRODUCTION_DB_COMMANDS=true.`
  );
}

export function buildPgFoundationConfig(env: NodeJS.ProcessEnv = process.env): PgFoundationConfig {
  const appEnv = getPgAppEnv(env);
  const sslMode = parseEnumValue(
    env.DATABASE_SSL_MODE,
    allowedSslModes,
    getDefaultPgSslMode(appEnv),
    "DATABASE_SSL_MODE"
  );
  const parsedDatabaseUrl = parsePostgresUrl(env.DATABASE_URL, "DATABASE_URL");
  const parsedTestUrl = env.TEST_DATABASE_URL ? parsePostgresUrl(env.TEST_DATABASE_URL, "TEST_DATABASE_URL") : null;
  const sslCaFile = String(env.DATABASE_SSL_CA_FILE ?? "").trim() || null;
  if (sslCaFile && sslMode !== "require") {
    throw new Error("DATABASE_SSL_CA_FILE requires DATABASE_SSL_MODE=require.");
  }

  return {
    ...summarizeDatabaseUrl(parsedDatabaseUrl.toString(), sslMode, appEnv),
    databaseUrl: parsedDatabaseUrl.toString(),
    testDatabaseUrl: parsedTestUrl ? parsedTestUrl.toString() : null,
    maxPoolSize: parsePositiveInteger(env.PGPOOL_MAX, 10, "PGPOOL_MAX"),
    idleTimeoutMs: parsePositiveInteger(env.PGPOOL_IDLE_TIMEOUT_MS, 30_000, "PGPOOL_IDLE_TIMEOUT_MS"),
    connectionTimeoutMs: parsePositiveInteger(
      env.PGPOOL_CONNECTION_TIMEOUT_MS,
      10_000,
      "PGPOOL_CONNECTION_TIMEOUT_MS"
    ),
    statementTimeoutMs: parsePositiveInteger(env.PGSTATEMENT_TIMEOUT_MS, 15_000, "PGSTATEMENT_TIMEOUT_MS"),
    applicationName: String(env.PGAPP_NAME || "dental-record-system-v2-foundation").trim(),
    allowProductionCommands: parseBooleanValue(env.ALLOW_PRODUCTION_DB_COMMANDS, false),
    sslCaFile
  };
}

export function buildPgPoolConfig(config: PgFoundationConfig): PoolConfig {
  const baseConfig: PoolConfig = {
    connectionString: config.databaseUrl,
    max: config.maxPoolSize,
    idleTimeoutMillis: config.idleTimeoutMs,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    application_name: config.applicationName
  };

  if (config.sslMode === "require") {
    let ca: string | undefined;
    if (config.sslCaFile) {
      try {
        ca = readFileSync(config.sslCaFile, "utf8");
      } catch {
        throw new Error("DATABASE_SSL_CA_FILE cannot be read. Check the configured certificate path.");
      }
      if (!/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.test(ca)) {
        throw new Error("DATABASE_SSL_CA_FILE must contain a PEM-encoded CA certificate.");
      }
    }
    return {
      ...baseConfig,
      ssl: {
        rejectUnauthorized: true,
        ...(ca === undefined ? {} : { ca })
      }
    };
  }

  if (config.sslMode === "no-verify") {
    return {
      ...baseConfig,
      ssl: {
        rejectUnauthorized: false
      }
    };
  }

  return baseConfig;
}
