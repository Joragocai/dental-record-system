export type AppointmentDomainErrorCode =
  | "APPOINTMENT_INPUT_INVALID"
  | "APPOINTMENT_NOT_FOUND"
  | "APPOINTMENT_BRANCH_NOT_FOUND"
  | "APPOINTMENT_PATIENT_NOT_FOUND"
  | "APPOINTMENT_DENTIST_INVALID"
  | "APPOINTMENT_PERMISSION_DENIED"
  | "APPOINTMENT_STATE_INVALID"
  | "APPOINTMENT_SLOT_CONFLICT"
  | "APPOINTMENT_PERSISTENCE_ERROR";

export class AppointmentDomainError extends Error {
  readonly code: AppointmentDomainErrorCode;
  readonly details: readonly string[];

  constructor(code: AppointmentDomainErrorCode, details: readonly string[] = []) {
    super(code);
    this.name = "AppointmentDomainError";
    this.code = code;
    this.details = [...details];
  }
}

export function toAppointmentPersistenceError(error: unknown): AppointmentDomainError {
  if (error instanceof AppointmentDomainError) return error;
  return new AppointmentDomainError("APPOINTMENT_PERSISTENCE_ERROR");
}
