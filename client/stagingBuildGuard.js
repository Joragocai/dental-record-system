/** Validate deploy-time frontend identity before Vite embeds public variables. */
export function assertStagingBuildEnvironment(env) {
  if (env.VERCEL === "1" && env.VITE_APP_ENV !== "staging") {
    throw new Error("Vercel builds require explicit VITE_APP_ENV=staging to prevent development credentials from being bundled.");
  }
  if (env.VITE_APP_ENV !== "staging") return;

  const projectRef = String(env.STAGING_SUPABASE_PROJECT_REF ?? "").trim();
  if (!/^[a-z0-9]{15,32}$/.test(projectRef)) {
    throw new Error("Staging build requires STAGING_SUPABASE_PROJECT_REF from the dedicated staging project.");
  }
  const supabaseValue = String(env.VITE_SUPABASE_URL ?? "").trim();
  const apiValue = String(env.VITE_API_BASE_URL ?? "").trim();
  const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  if (!key) throw new Error("Staging build requires VITE_SUPABASE_PUBLISHABLE_KEY.");

  let supabase;
  let api;
  try {
    supabase = new URL(supabaseValue);
    api = new URL(apiValue);
  } catch {
    throw new Error("Staging build requires valid absolute HTTPS Supabase and API URLs.");
  }
  if (
    supabase.protocol !== "https:" ||
    supabase.origin !== `https://${projectRef}.supabase.co` ||
    supabase.pathname !== "/" ||
    supabase.search || supabase.hash || supabase.username || supabase.password
  ) {
    throw new Error("Staging Supabase URL does not match STAGING_SUPABASE_PROJECT_REF.");
  }
  if (
    api.protocol !== "https:" ||
    api.pathname !== "/api" ||
    api.search || api.hash || api.username || api.password ||
    !api.hostname.endsWith(".onrender.com") ||
    !api.hostname.startsWith("dental-record-staging-api")
  ) {
    throw new Error("Staging API must be the approved Render staging HTTPS /api endpoint.");
  }
}
