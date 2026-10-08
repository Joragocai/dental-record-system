import { buildPgFoundationConfig } from "../postgres/config.js";
import { buildAuthenticationConfig } from "../auth/authConfig.js";
import { buildStaffProvisioningConfig } from "../staff/staffProvisioningConfig.js";
import { buildAttachmentStorageConfig } from "../attachments/attachmentStorageConfig.js";

export function isHostedEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = (env.DENTAL_SERVER_ENV ?? "local").trim().toLowerCase();
  if (!["local", "test", "staging", "production"].includes(mode)) {
    throw new Error("DENTAL_SERVER_ENV must be local, test, staging, or production.");
  }
  if (env.NODE_ENV === "production" && mode !== "staging" && mode !== "production") {
    throw new Error("A production Node process requires explicit DENTAL_SERVER_ENV=staging or production.");
  }
  return mode === "staging" || mode === "production";
}

export function getAllowedCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const hosted = isHostedEnvironment(env);
  const origins = (env.CORS_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (hosted && origins.length === 0) {
    throw new Error("Hosted environments require CORS_ALLOWED_ORIGINS.");
  }
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("CORS_ALLOWED_ORIGINS contains an invalid origin.");
    }
    if (parsed.origin !== origin || parsed.username || parsed.password || (hosted && parsed.protocol !== "https:")) {
      throw new Error("CORS_ALLOWED_ORIGINS must contain exact HTTPS origins in hosted environments.");
    }
  }
  return hosted ? origins : [...new Set([...origins, "http://127.0.0.1:5173", "http://localhost:5173"])];
}

/**
 * Prevent cross-project writes caused by copying a development DATABASE_URL into
 * a staging API. Supabase direct endpoints encode the project in the hostname;
 * shared session-pooler endpoints encode it in the database username.
 */
export function assertSupabaseDatabaseIdentity(databaseUrl: string, supabaseUrl: string): void {
  const projectHost = new URL(supabaseUrl).hostname.toLowerCase();
  const match = /^([a-z0-9-]+)\.supabase\.co$/.exec(projectHost);
  if (!match) {
    throw new Error("Hosted SUPABASE_URL must identify an individual Supabase project.");
  }

  const projectRef = match[1];
  const database = new URL(databaseUrl);
  const databaseHost = database.hostname.toLowerCase();
  const databaseUser = decodeURIComponent(database.username).toLowerCase();
  const directEndpoint = databaseHost === `db.${projectRef}.supabase.co`;
  const pooledEndpoint = databaseHost.endsWith(".pooler.supabase.com") &&
    databaseUser.endsWith(`.${projectRef}`) &&
    databaseUser.length > projectRef.length + 1;

  if (!directEndpoint && !pooledEndpoint) {
    throw new Error("DATABASE_URL does not identify the configured Supabase project.");
  }
}

export function validateHostedConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  if (!isHostedEnvironment(env)) return;
  const origins = getAllowedCorsOrigins(env);
  const database = buildPgFoundationConfig(env);
  if (database.sslMode !== "require") {
    throw new Error("Hosted PostgreSQL connections require verified TLS (DATABASE_SSL_MODE=require).");
  }
  const authentication = buildAuthenticationConfig(env);
  assertSupabaseDatabaseIdentity(database.databaseUrl, authentication.supabaseUrl);
  const provisioning = buildStaffProvisioningConfig(env);
  const storage = buildAttachmentStorageConfig(env);
  if (authentication.supabaseUrl !== provisioning.supabaseUrl || authentication.supabaseUrl !== storage.supabaseUrl) {
    throw new Error("Authentication, provisioning, and private storage must use one Supabase project.");
  }
  const redirect = new URL(provisioning.inviteRedirectUrl);
  if (!origins.includes(redirect.origin) || redirect.pathname !== "/activate-account") {
    throw new Error("STAFF_INVITE_REDIRECT_URL must use a configured frontend HTTPS origin and /activate-account.");
  }
  if (env.DENTAL_SERVER_ENV === "production" && storage.bucket.endsWith("-dev")) {
    throw new Error("Production must not use a development attachment bucket.");
  }
}
