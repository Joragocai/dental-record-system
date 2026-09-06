export type StaffProvisioningErrorCode =
  | "STAFF_PROVISIONING_INPUT_INVALID"
  | "STAFF_PROVISIONING_TARGET_NOT_FOUND"
  | "STAFF_PROVISIONING_TARGET_NOT_PENDING"
  | "STAFF_PROVISIONING_TARGET_INVALID"
  | "STAFF_PROVISIONING_EMAIL_MISMATCH"
  | "STAFF_PROVISIONING_PROVIDER_CONFLICT"
  | "STAFF_PROVISIONING_PROVIDER_UNAVAILABLE"
  | "STAFF_PROVISIONING_RECONCILIATION_REQUIRED"
  | "STAFF_PROVISIONING_PERSISTENCE_ERROR";

const statusByCode: Record<StaffProvisioningErrorCode, number> = {
  STAFF_PROVISIONING_INPUT_INVALID: 400,
  STAFF_PROVISIONING_TARGET_NOT_FOUND: 404,
  STAFF_PROVISIONING_TARGET_NOT_PENDING: 409,
  STAFF_PROVISIONING_TARGET_INVALID: 409,
  STAFF_PROVISIONING_EMAIL_MISMATCH: 403,
  STAFF_PROVISIONING_PROVIDER_CONFLICT: 409,
  STAFF_PROVISIONING_PROVIDER_UNAVAILABLE: 503,
  STAFF_PROVISIONING_RECONCILIATION_REQUIRED: 503,
  STAFF_PROVISIONING_PERSISTENCE_ERROR: 500
};

const messageByCode: Record<StaffProvisioningErrorCode, string> = {
  STAFF_PROVISIONING_INPUT_INVALID: "Staff provisioning details are invalid.",
  STAFF_PROVISIONING_TARGET_NOT_FOUND: "The staff account was not found.",
  STAFF_PROVISIONING_TARGET_NOT_PENDING: "The staff account is not pending activation.",
  STAFF_PROVISIONING_TARGET_INVALID: "The staff account is not eligible for routine provisioning.",
  STAFF_PROVISIONING_EMAIL_MISMATCH: "The authenticated identity does not match this staff account.",
  STAFF_PROVISIONING_PROVIDER_CONFLICT: "The authentication provider already has an account conflict for this staff record.",
  STAFF_PROVISIONING_PROVIDER_UNAVAILABLE: "Staff invitation service is temporarily unavailable.",
  STAFF_PROVISIONING_RECONCILIATION_REQUIRED: "Staff invitation requires administrator reconciliation before retrying.",
  STAFF_PROVISIONING_PERSISTENCE_ERROR: "Staff provisioning information could not be saved safely."
};

export class StaffProvisioningError extends Error {
  readonly code: StaffProvisioningErrorCode;
  readonly status: number;

  constructor(code: StaffProvisioningErrorCode) {
    super(messageByCode[code]);
    this.name = "StaffProvisioningError";
    this.code = code;
    this.status = statusByCode[code];
  }
}

export function toStaffProvisioningPersistenceError(error: unknown): StaffProvisioningError {
  if (error instanceof StaffProvisioningError) return error;
  return new StaffProvisioningError("STAFF_PROVISIONING_PERSISTENCE_ERROR");
}
