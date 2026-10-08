export const attachmentAllowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
] as const;

export const attachmentMaxFileSizeBytes = 20 * 1024 * 1024;

export interface AttachmentStorageConfig {
  supabaseUrl: string;
  secretKey: string;
  bucket: string;
  requestTimeoutMs: number;
  downloadUrlTtlSeconds: number;
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

function boundedInteger(
  value: string | undefined,
  fallback: number,
  label: string,
  minimum: number,
  maximum: number
): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) throw new Error(`${label} must be an integer.`);
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function requireBucketName(value: string): string {
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,62}$/.test(normalized)) {
    throw new Error("SUPABASE_ATTACHMENT_BUCKET must be a safe lowercase bucket name.");
  }
  return normalized;
}

export function buildAttachmentStorageConfig(env: NodeJS.ProcessEnv = process.env): AttachmentStorageConfig {
  const supabaseUrl = String(env.SUPABASE_URL ?? "").trim();
  const secretKey = String(env.SUPABASE_SECRET_KEY ?? "").trim();
  const bucket = String(env.SUPABASE_ATTACHMENT_BUCKET ?? "").trim();

  if (!supabaseUrl) throw new Error("SUPABASE_URL is required for private attachment storage.");
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is required for private attachment storage.");
  if (!bucket) throw new Error("SUPABASE_ATTACHMENT_BUCKET is required for private attachment storage.");

  return {
    supabaseUrl: requireHttpsOrLocalhost(supabaseUrl, "SUPABASE_URL"),
    secretKey,
    bucket: requireBucketName(bucket),
    requestTimeoutMs: boundedInteger(
      env.ATTACHMENT_STORAGE_REQUEST_TIMEOUT_MS,
      10000,
      "ATTACHMENT_STORAGE_REQUEST_TIMEOUT_MS",
      1000,
      60000
    ),
    downloadUrlTtlSeconds: boundedInteger(
      env.ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS,
      120,
      "ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS",
      30,
      900
    )
  };
}
