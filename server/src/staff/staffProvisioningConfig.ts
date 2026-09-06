export interface StaffProvisioningConfig {
  supabaseUrl: string;
  secretKey: string;
  requestTimeoutMs: number;
  inviteRedirectUrl: string;
}

function requireHttpsOrLocalhost(rawValue: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawValue.trim());
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localHosts.has(parsed.hostname))) {
    throw new Error(`${label} must use HTTPS except for localhost development.`);
  }
  return parsed.toString().replace(/\/$/, "");
}

function positiveInteger(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

export function buildStaffProvisioningConfig(env: NodeJS.ProcessEnv = process.env): StaffProvisioningConfig {
  const supabaseUrl = String(env.SUPABASE_URL ?? "").trim();
  const secretKey = String(env.SUPABASE_SECRET_KEY ?? "").trim();
  const inviteRedirectUrl = String(env.STAFF_INVITE_REDIRECT_URL ?? "").trim();

  if (!supabaseUrl) throw new Error("SUPABASE_URL is required for staff provisioning.");
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is required for staff provisioning.");
  if (!inviteRedirectUrl) throw new Error("STAFF_INVITE_REDIRECT_URL is required for staff provisioning.");

  return {
    supabaseUrl: requireHttpsOrLocalhost(supabaseUrl, "SUPABASE_URL"),
    secretKey,
    requestTimeoutMs: positiveInteger(env.STAFF_PROVISIONING_REQUEST_TIMEOUT_MS, 8000, "STAFF_PROVISIONING_REQUEST_TIMEOUT_MS"),
    inviteRedirectUrl: requireHttpsOrLocalhost(inviteRedirectUrl, "STAFF_INVITE_REDIRECT_URL")
  };
}
