import { getAuthenticationConfig, type AuthenticationConfig } from "./authConfig.js";
import { parseBearerToken } from "./bearerToken.js";
import {
  createSupabaseAccessTokenVerifier,
  type AccessTokenVerifier,
  type AuthenticatedPrincipal
} from "./authVerifier.js";

export interface AuthenticationService {
  authenticateAuthorizationHeader(authorizationHeader: string | string[] | undefined): Promise<AuthenticatedPrincipal>;
}

export interface AuthenticationServiceOptions {
  config?: AuthenticationConfig;
  verifier?: AccessTokenVerifier;
}

export function createAuthenticationService(options: AuthenticationServiceOptions = {}): AuthenticationService {
  return {
    async authenticateAuthorizationHeader(authorizationHeader) {
      const accessToken = parseBearerToken(authorizationHeader);
      const config = options.config ?? getAuthenticationConfig();
      const verifier = options.verifier ?? createSupabaseAccessTokenVerifier(config);
      return verifier.verifyAccessToken(accessToken);
    }
  };
}
