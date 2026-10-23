// An explicit environment opt-in AND a matching database-side sentinel are
// required before any hosted Demo Fill/Reset can remove records.
const forbidden = (message = "Hosted Demo Tools are not enabled for this isolated database.") =>
  Object.assign(new Error(message), { status: 403 });

export function getCloudDemoConfiguration(env = process.env) {
  if (env.CLOUD_DEMO_ENABLED !== "true" || env.CLOUD_DEMO_ENVIRONMENT !== "dental-presentation-demo") {
    throw forbidden();
  }
  const ref = String(env.CLOUD_DEMO_PROJECT_REF || "").trim();
  if (!/^[a-z0-9-]{6,40}$/.test(ref)) throw forbidden();
  let database;
  let supabase;
  try {
    database = new URL(String(env.DATABASE_URL || ""));
    supabase = new URL(String(env.SUPABASE_URL || ""));
  } catch {
    throw forbidden();
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || supabase.protocol !== "https:") {
    throw forbidden();
  }
  if (env.CLOUD_LOCAL_PREVIEW === "true") {
    if (ref !== "local-preview" || env.NODE_ENV === "production" ||
      !["127.0.0.1", "localhost"].includes(database.hostname) ||
      database.pathname !== "/dental_presentation_local") throw forbidden();
    return { ref, localTest: true };
  }
  const localTest = env.CLOUD_DEMO_LOCAL_TEST === "true";
  if (localTest) {
    if (ref !== "local-test" || env.NODE_ENV === "production" ||
        !["127.0.0.1", "localhost"].includes(database.hostname) ||
        database.pathname !== "/dental_presentation_test") throw forbidden();
    return { ref, localTest: true };
  }
  if (ref === "local-test" || supabase.hostname !== `${ref}.supabase.co` ||
      database.pathname !== "/postgres") throw forbidden();
  const direct = database.hostname === `db.${ref}.supabase.co` && database.username === "postgres";
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(database.hostname) &&
    database.username === `postgres.${ref}`;
  if (!direct && !pooler) throw forbidden();
  return { ref, localTest: false };
}

export async function assertCloudDemoGuard(client, config, { lock = false } = {}) {
  const suffix = lock ? " FOR UPDATE" : "";
  const result = await client.query(
    "SELECT project_ref, enabled, environment_name FROM public.demo_environment_guard WHERE singleton=TRUE" + suffix
  );
  const marker = result.rows[0];
  if (!marker || marker.project_ref !== config.ref || marker.enabled !== true ||
      marker.environment_name !== "dental-presentation-demo") {
    throw forbidden();
  }
}

export function validateDemoStorageObjectPath(value) {
  if (typeof value !== "string" ||
      !/^(patients\/P-[0-9]{4}-[0-9]{4}|treatments\/T-[0-9]{4}-[0-9]{4})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf|doc|docx|txt)$/.test(value)) {
    throw forbidden("Demo Storage cleanup encountered an unexpected object path; manual review required.");
  }
  return value;
}
