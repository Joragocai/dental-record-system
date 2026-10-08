export interface BrowserAuthenticationConfig {
  supabaseUrl: string;
  publishableKey: string;
  apiBaseUrl: string;
}

export interface BrowserAuthenticationConfigResult {
  configured: boolean;
  config: BrowserAuthenticationConfig | null;
  reason: string | null;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function readBrowserAuthenticationConfig(
  env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>
): BrowserAuthenticationConfigResult {
  const supabaseUrl = String(env.VITE_SUPABASE_URL ?? "").trim();
  const publishableKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const isHosted = env.VITE_APP_ENV === "staging" || env.VITE_APP_ENV === "production" || import.meta.env?.PROD === true;
  const apiBaseUrl = trimTrailingSlash(String(env.VITE_API_BASE_URL ?? (isHosted ? "" : "http://127.0.0.1:3002/api")).trim());

  if (!supabaseUrl || !publishableKey) {
    return {
      configured: false,
      config: null,
      reason: "Browser authentication is not configured yet."
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    return { configured: false, config: null, reason: "Browser authentication configuration is invalid." };
  }

  const isLoopback = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
  if (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && isLoopback)) {
    return { configured: false, config: null, reason: "Browser authentication configuration is invalid." };
  }

  if (isHosted) {
    try {
      const apiUrl = new URL(apiBaseUrl);
      if (apiUrl.protocol !== "https:" || apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash || !apiUrl.pathname.endsWith("/api")) {
        throw new Error("Invalid staging API URL.");
      }
    } catch {
      return { configured: false, config: null, reason: "Hosted authentication requires a valid HTTPS VITE_API_BASE_URL ending in /api." };
    }
  }

  return {
    configured: true,
    config: {
      supabaseUrl: trimTrailingSlash(supabaseUrl),
      publishableKey,
      apiBaseUrl
    },
    reason: null
  };
}
