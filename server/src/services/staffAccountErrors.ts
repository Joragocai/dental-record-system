export type StaffAccountErrorCode =
  | "STAFF_ACCOUNT_INPUT_INVALID"
  | "STAFF_ACCOUNT_ROLE_INVALID"
  | "STAFF_ACCOUNT_BRANCH_INVALID"
  | "STAFF_ACCOUNT_EMAIL_CONFLICT"
  | "STAFF_ACCOUNT_PERSISTENCE_ERROR";

const statusByCode: Record<StaffAccountErrorCode, number> = {
  STAFF_ACCOUNT_INPUT_INVALID: 400,
  STAFF_ACCOUNT_ROLE_INVALID: 400,
  STAFF_ACCOUNT_BRANCH_INVALID: 400,
  STAFF_ACCOUNT_EMAIL_CONFLICT: 409,
  STAFF_ACCOUNT_PERSISTENCE_ERROR: 500
};

const messageByCode: Record<StaffAccountErrorCode, string> = {
  STAFF_ACCOUNT_INPUT_INVALID: "Staff account details are invalid.",
  STAFF_ACCOUNT_ROLE_INVALID: "One or more staff roles are invalid.",
  STAFF_ACCOUNT_BRANCH_INVALID: "One or more staff branches are invalid.",
  STAFF_ACCOUNT_EMAIL_CONFLICT: "A staff account with this email already exists.",
  STAFF_ACCOUNT_PERSISTENCE_ERROR: "Staff account information could not be saved safely."
};

export class StaffAccountError extends Error {
  readonly code: StaffAccountErrorCode;
  readonly status: number;

  constructor(code: StaffAccountErrorCode) {
    super(messageByCode[code]);
    this.name = "StaffAccountError";
    this.code = code;
    this.status = statusByCode[code];
  }
}

interface PgLikeError {
  code?: unknown;
  constraint?: unknown;
}

export function toStaffAccountPersistenceError(error: unknown): StaffAccountError {
  if (error instanceof StaffAccountError) return error;

  const pgError = error as PgLikeError;
  if (
    pgError?.code === "23505" &&
    typeof pgError.constraint === "string" &&
    pgError.constraint === "app_users_email_lower_unique"
  ) {
    return new StaffAccountError("STAFF_ACCOUNT_EMAIL_CONFLICT");
  }

  return new StaffAccountError("STAFF_ACCOUNT_PERSISTENCE_ERROR");
}
