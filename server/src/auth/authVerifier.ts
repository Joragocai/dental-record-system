import { AuthenticationError, toSafeAuthenticationError } from "./authErrors.js";
import type { AuthenticationConfig } from "./authConfig.js";

export interface AuthenticatedPrincipal {
  subject: string;
  email: string | null;
  audience: string;
  provider: "supabase";
}

export interface AccessTokenVerifier {
  verifyAccessToken(accessToken: string): Promise<AuthenticatedPrincipal>;
}

interface SupabaseUserPayload {
  id?: unknown;
  email?: unknown;
  aud?: unknown;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeAudience(aud: unknown): string[] {
  if (typeof aud === "string") return [aud];
  if (Array.isArray(aud) && aud.every((item) => typeof item === "string")) return aud;
  return [];
}

function mapVerifiedUser(payload: SupabaseUserPayload, expectedAudience: string): AuthenticatedPrincipal {
  if (typeof payload.id !== "string" || !isUuid(payload.id)) {
    throw new AuthenticationError("PROVIDER_RESPONSE_INVALID");
  }

  const audiences = normalizeAudience(payload.aud);
  if (!audiences.length) {
    throw new AuthenticationError("PROVIDER_RESPONSE_INVALID");
  }
  if (!audiences.includes(expectedAudience)) {
    throw new AuthenticationError("AUDIENCE_MISMATCH");
  }

  if (payload.email !== undefined && payload.email !== null && typeof payload.email !== "string") {
    throw new AuthenticationError("PROVIDER_RESPONSE_INVALID");
  }

  return {
    subject: payload.id,
    email: typeof payload.email === "string" ? payload.email : null,
    audience: expectedAudience,
    provider: "supabase"
  };
}

export function createSupabaseAccessTokenVerifier(
  config: AuthenticationConfig,
  fetchImpl: typeof fetch = fetch
): AccessTokenVerifier {
  return {
    async verifyAccessToken(accessToken: string): Promise<AuthenticatedPrincipal> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

      try {
        let response: Response;
        try {
          response = await fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
            method: "GET",
            headers: {
              apikey: config.publishableKey,
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json"
            },
            signal: controller.signal
          });
        } catch {
          throw new AuthenticationError("PROVIDER_UNAVAILABLE");
        }

        if (response.status === 401 || response.status === 403) {
          throw new AuthenticationError("TOKEN_INVALID");
        }
        if (!response.ok) {
          throw new AuthenticationError("PROVIDER_UNAVAILABLE");
        }

        let payload: SupabaseUserPayload;
        try {
          payload = (await response.json()) as SupabaseUserPayload;
        } catch {
          throw new AuthenticationError("PROVIDER_RESPONSE_INVALID");
        }

        return mapVerifiedUser(payload, config.expectedAudience);
      } catch (error) {
        throw toSafeAuthenticationError(error);
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
