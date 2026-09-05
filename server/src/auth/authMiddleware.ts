import { toSafeAuthenticationError } from "./authErrors.js";
import { createAuthenticationService, type AuthenticationService } from "./authService.js";
import type { AuthenticatedPrincipal } from "./authVerifier.js";

export interface AuthenticationLocals {
  auth?: AuthenticatedPrincipal;
}

export interface AuthenticationRequestLike {
  headers: {
    authorization?: string | string[];
  };
}

export interface AuthenticationResponseLike {
  locals: AuthenticationLocals;
  setHeader(name: string, value: string): void;
}

export type AuthenticationNextFunction = (error?: unknown) => void;

export function createAuthenticateMiddleware(
  authenticationService: AuthenticationService = createAuthenticationService()
) {
  return async function authenticate(
    req: AuthenticationRequestLike,
    res: AuthenticationResponseLike,
    next: AuthenticationNextFunction
  ): Promise<void> {
    try {
      const principal = await authenticationService.authenticateAuthorizationHeader(req.headers.authorization);
      res.locals.auth = principal;
      next();
    } catch (error) {
      const safeError = toSafeAuthenticationError(error);
      if (safeError.status === 401) {
        res.setHeader("WWW-Authenticate", "Bearer");
      }
      next(safeError);
    }
  };
}
