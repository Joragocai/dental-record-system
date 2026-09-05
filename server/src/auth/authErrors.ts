export type AuthenticationErrorCode =
  | "AUTH_CONFIG_INVALID"
  | "CREDENTIALS_MISSING"
  | "CREDENTIALS_MALFORMED"
  | "TOKEN_INVALID"
  | "AUDIENCE_MISMATCH"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_RESPONSE_INVALID";

const defaultMessages: Record<AuthenticationErrorCode, string> = {
  AUTH_CONFIG_INVALID: "Authentication is not configured correctly.",
  CREDENTIALS_MISSING: "Authentication is required.",
  CREDENTIALS_MALFORMED: "Authentication credentials are malformed.",
  TOKEN_INVALID: "Authentication credentials are invalid.",
  AUDIENCE_MISMATCH: "Authentication credentials are invalid.",
  PROVIDER_UNAVAILABLE: "Authentication service is temporarily unavailable.",
  PROVIDER_RESPONSE_INVALID: "Authentication service returned an invalid response."
};

const statusByCode: Record<AuthenticationErrorCode, number> = {
  AUTH_CONFIG_INVALID: 500,
  CREDENTIALS_MISSING: 401,
  CREDENTIALS_MALFORMED: 401,
  TOKEN_INVALID: 401,
  AUDIENCE_MISMATCH: 401,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_RESPONSE_INVALID: 502
};

export class AuthenticationError extends Error {
  readonly code: AuthenticationErrorCode;
  readonly status: number;

  constructor(code: AuthenticationErrorCode) {
    super(defaultMessages[code]);
    this.name = "AuthenticationError";
    this.code = code;
    this.status = statusByCode[code];
  }
}

export function toSafeAuthenticationError(error: unknown): AuthenticationError {
  if (error instanceof AuthenticationError) return error;
  return new AuthenticationError("PROVIDER_UNAVAILABLE");
}
