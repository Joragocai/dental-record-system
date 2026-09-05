export type AuthorizationErrorCode =
  | "AUTHORIZATION_DENIED"
  | "AUTHORIZATION_BRANCH_REQUIRED"
  | "AUTHORIZATION_BRANCH_INVALID"
  | "AUTHORIZATION_OWNERSHIP_NOT_IMPLEMENTED"
  | "AUTHORIZATION_PERSISTENCE_ERROR";

const statusByCode: Record<AuthorizationErrorCode, number> = {
  AUTHORIZATION_DENIED: 403,
  AUTHORIZATION_BRANCH_REQUIRED: 400,
  AUTHORIZATION_BRANCH_INVALID: 400,
  AUTHORIZATION_OWNERSHIP_NOT_IMPLEMENTED: 403,
  AUTHORIZATION_PERSISTENCE_ERROR: 500
};

const messageByCode: Record<AuthorizationErrorCode, string> = {
  AUTHORIZATION_DENIED: "You are not authorized to perform this action.",
  AUTHORIZATION_BRANCH_REQUIRED: "A valid branch is required for this action.",
  AUTHORIZATION_BRANCH_INVALID: "A valid branch is required for this action.",
  AUTHORIZATION_OWNERSHIP_NOT_IMPLEMENTED: "You are not authorized to perform this action.",
  AUTHORIZATION_PERSISTENCE_ERROR: "Authorization could not be evaluated safely."
};

export class AuthorizationError extends Error {
  readonly code: AuthorizationErrorCode;
  readonly status: number;

  constructor(code: AuthorizationErrorCode) {
    super(messageByCode[code]);
    this.name = "AuthorizationError";
    this.code = code;
    this.status = statusByCode[code];
  }
}

export function toAuthorizationPersistenceError(error: unknown): AuthorizationError {
  if (error instanceof AuthorizationError) return error;
  return new AuthorizationError("AUTHORIZATION_PERSISTENCE_ERROR");
}
