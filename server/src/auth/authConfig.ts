import { AuthenticationError } from "./authErrors.js";

export interface AuthenticationConfig {
  supabaseUrl: string;
  publishableKey: string;
  expectedAudience: string;
  requestTimeoutMs: number;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AuthenticationError("AUTH_CONFIG_INVALID");
  }
  return parsed;
}

function parseSupabaseUrl(value: string | undefined): string {
  if (!value || !value.trim()) throw new AuthenticationError("AUTH_CONFIG_INVALID");

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AuthenticationError("AUTH_CONFIG_INVALID");
  }

  const isHttps = url.protocol === "https:";
  const isLocalHttp =
    url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1");
  if (!isHttps && !isLocalHttp) throw new AuthenticationError("AUTH_CONFIG_INVALID");

  return url.toString().replace(/\/$/, "");
}

export function buildAuthenticationConfig(env: NodeJS.ProcessEnv = process.env): AuthenticationConfig {
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const expectedAudience = env.AUTH_JWT_AUDIENCE?.trim() || "authenticated";

  if (!publishableKey || !expectedAudience) throw new AuthenticationError("AUTH_CONFIG_INVALID");

  return {
    supabaseUrl: parseSupabaseUrl(env.SUPABASE_URL),
    publishableKey,
    expectedAudience,
    requestTimeoutMs: parsePositiveInteger(env.AUTH_REQUEST_TIMEOUT_MS, 5000)
  };
}

export function getAuthenticationConfig(env: NodeJS.ProcessEnv = process.env): AuthenticationConfig {
  return buildAuthenticationConfig(env);
}
