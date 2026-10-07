export type InitialOwnerBootstrapErrorCode =
  | "INITIAL_OWNER_BOOTSTRAP_INPUT_INVALID"
  | "INITIAL_OWNER_BOOTSTRAP_ALREADY_COMPLETED"
  | "INITIAL_OWNER_BOOTSTRAP_EMAIL_CONFLICT"
  | "INITIAL_OWNER_BOOTSTRAP_BRANCH_INVALID"
  | "INITIAL_OWNER_BOOTSTRAP_ROLE_INVALID"
  | "INITIAL_OWNER_BOOTSTRAP_PROVIDER_CONFLICT"
  | "INITIAL_OWNER_BOOTSTRAP_PROVIDER_UNAVAILABLE"
  | "INITIAL_OWNER_BOOTSTRAP_PERSISTENCE_ERROR"
  | "INITIAL_OWNER_BOOTSTRAP_RECONCILIATION_REQUIRED";

const statusByCode: Record<InitialOwnerBootstrapErrorCode, number> = {
  INITIAL_OWNER_BOOTSTRAP_INPUT_INVALID: 400,
  INITIAL_OWNER_BOOTSTRAP_ALREADY_COMPLETED: 409,
  INITIAL_OWNER_BOOTSTRAP_EMAIL_CONFLICT: 409,
  INITIAL_OWNER_BOOTSTRAP_BRANCH_INVALID: 400,
  INITIAL_OWNER_BOOTSTRAP_ROLE_INVALID: 500,
  INITIAL_OWNER_BOOTSTRAP_PROVIDER_CONFLICT: 409,
  INITIAL_OWNER_BOOTSTRAP_PROVIDER_UNAVAILABLE: 503,
  INITIAL_OWNER_BOOTSTRAP_PERSISTENCE_ERROR: 503,
  INITIAL_OWNER_BOOTSTRAP_RECONCILIATION_REQUIRED: 503
};

export class InitialOwnerBootstrapError extends Error {
  readonly code: InitialOwnerBootstrapErrorCode;
  readonly status: number;

  constructor(code: InitialOwnerBootstrapErrorCode) {
    super("Initial owner bootstrap could not be completed.");
    this.name = "InitialOwnerBootstrapError";
    this.code = code;
    this.status = statusByCode[code];
  }
}

export function toInitialOwnerBootstrapPersistenceError(error: unknown): InitialOwnerBootstrapError {
  if (error instanceof InitialOwnerBootstrapError) return error;
  return new InitialOwnerBootstrapError("INITIAL_OWNER_BOOTSTRAP_PERSISTENCE_ERROR");
}
