import { buildPgFoundationConfig, getPgAppEnv, getDatabaseNameFromUrl, parsePostgresUrl } from "./config.js";

const localTestHosts = new Set(["127.0.0.1", "::1", "localhost"]);

export function isLocalPgHost(hostname: string): boolean {
  return localTestHosts.has(String(hostname || "").trim().toLowerCase());
}

export function assertSafeTestDatabaseTarget(
  testDatabaseUrl: string,
  primaryDatabaseUrl: string,
  appEnv = getPgAppEnv()
): void {
  if (appEnv !== "test") {
    throw new Error("PostgreSQL integration checks require DENTAL_SERVER_ENV=test.");
  }

  if (testDatabaseUrl === primaryDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL must not match DATABASE_URL.");
  }

  const parsedTestUrl = parsePostgresUrl(testDatabaseUrl, "TEST_DATABASE_URL");
  if (!isLocalPgHost(parsedTestUrl.hostname)) {
    throw new Error("TEST_DATABASE_URL must target a local PostgreSQL host.");
  }

  const testDatabaseName = getDatabaseNameFromUrl(parsedTestUrl).toLowerCase();
  if (!testDatabaseName.includes("test")) {
    throw new Error("TEST_DATABASE_URL database name must clearly identify a test database.");
  }

  if (testDatabaseName.includes("prod") || testDatabaseName.includes("production") || testDatabaseName.includes("staging")) {
    throw new Error("TEST_DATABASE_URL must not target a production or staging database name.");
  }
}

export interface PgIntegrationReadiness {
  ready: boolean;
  reason: string | null;
}

export function getPgIntegrationReadiness(env: NodeJS.ProcessEnv = process.env): PgIntegrationReadiness {
  try {
    const config = buildPgFoundationConfig(env);
    if (!config.testDatabaseUrl) {
      return {
        ready: false,
        reason: "TEST_DATABASE_URL is not configured."
      };
    }

    assertSafeTestDatabaseTarget(config.testDatabaseUrl, config.databaseUrl, config.appEnv);
    return {
      ready: true,
      reason: null
    };
  } catch (error) {
    return {
      ready: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}
