export type ApplicationUserErrorCode =
  | "INVALID_AUTH_IDENTITY"
  | "APPLICATION_USER_NOT_FOUND"
  | "APPLICATION_USER_PENDING"
  | "APPLICATION_USER_INACTIVE"
  | "APPLICATION_USER_DATA_INVALID"
  | "APPLICATION_USER_PERSISTENCE_ERROR";

const messages: Record<ApplicationUserErrorCode, string> = {
  INVALID_AUTH_IDENTITY: "Authenticated user identity is invalid.",
  APPLICATION_USER_NOT_FOUND: "No approved clinic application user is linked to this identity.",
  APPLICATION_USER_PENDING: "This clinic account is still pending activation.",
  APPLICATION_USER_INACTIVE: "This clinic account is not active.",
  APPLICATION_USER_DATA_INVALID: "Clinic account data is invalid.",
  APPLICATION_USER_PERSISTENCE_ERROR: "Clinic account information is temporarily unavailable."
};

export class ApplicationUserError extends Error {
  readonly code: ApplicationUserErrorCode;

  constructor(code: ApplicationUserErrorCode) {
    super(messages[code]);
    this.name = "ApplicationUserError";
    this.code = code;
  }
}

export function toApplicationUserPersistenceError(error: unknown): ApplicationUserError {
  if (error instanceof ApplicationUserError) return error;
  return new ApplicationUserError("APPLICATION_USER_PERSISTENCE_ERROR");
}
