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
  const apiBaseUrl = trimTrailingSlash(String(env.VITE_API_BASE_URL ?? "http://127.0.0.1:3002/api").trim());

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
