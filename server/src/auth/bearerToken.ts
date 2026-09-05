import { AuthenticationError } from "./authErrors.js";

export function parseBearerToken(authorizationHeader: string | string[] | undefined): string {
  if (authorizationHeader === undefined) {
    throw new AuthenticationError("CREDENTIALS_MISSING");
  }

  if (Array.isArray(authorizationHeader)) {
    throw new AuthenticationError("CREDENTIALS_MALFORMED");
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(authorizationHeader.trim());
  if (!match?.[1]) {
    throw new AuthenticationError("CREDENTIALS_MALFORMED");
  }

  return match[1];
}
