export type PatientDomainErrorCode =
  | "INVALID_INPUT"
  | "INVALID_IDENTITY"
  | "NOT_FOUND"
  | "BRANCH_NOT_FOUND"
  | "CODE_CONFLICT"
  | "PERSISTENCE_ERROR";

const defaultMessages: Record<PatientDomainErrorCode, string> = {
  INVALID_INPUT: "Patient data is invalid.",
  INVALID_IDENTITY: "Patient identity is invalid.",
  NOT_FOUND: "Patient was not found.",
  BRANCH_NOT_FOUND: "Branch was not found.",
  CODE_CONFLICT: "Patient code is already in use.",
  PERSISTENCE_ERROR: "Patient data could not be processed."
};

export class PatientDomainError extends Error {
  readonly code: PatientDomainErrorCode;
  readonly details: readonly string[];

  constructor(code: PatientDomainErrorCode, details: readonly string[] = []) {
    super(details[0] || defaultMessages[code]);
    this.name = "PatientDomainError";
    this.code = code;
    this.details = [...details];
  }
}

export function isPatientDomainError(error: unknown): error is PatientDomainError {
  return error instanceof PatientDomainError;
}

export function toPatientPersistenceError(error: unknown): PatientDomainError {
  if (isPatientDomainError(error)) return error;
  return new PatientDomainError("PERSISTENCE_ERROR");
}
