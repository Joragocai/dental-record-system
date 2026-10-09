import { AppointmentDomainError } from "./appointmentDomainErrors.js";

export interface AppointmentHttpError extends Error {
  status: number;
  code: string;
}

function httpError(status: number, code: string, message: string): AppointmentHttpError {
  const error = new Error(message) as AppointmentHttpError;
  error.name = "AppointmentHttpError";
  error.status = status;
  error.code = code;
  return error;
}

export function toAppointmentHttpError(error: unknown): AppointmentHttpError {
  if (!(error instanceof AppointmentDomainError)) {
    return httpError(503, "APPOINTMENT_UNAVAILABLE", "Appointment service is temporarily unavailable.");
  }

  switch (error.code) {
    case "APPOINTMENT_INPUT_INVALID":
      return httpError(400, error.code, "Appointment input is invalid.");
    case "APPOINTMENT_NOT_FOUND":
      return httpError(404, error.code, "Appointment was not found.");
    case "APPOINTMENT_BRANCH_NOT_FOUND":
      return httpError(404, error.code, "Branch was not found.");
    case "APPOINTMENT_PATIENT_NOT_FOUND":
      return httpError(404, error.code, "Patient was not found.");
    case "APPOINTMENT_DENTIST_INVALID":
      return httpError(409, error.code, "The selected Dentist is not available for this branch.");
    case "APPOINTMENT_PERMISSION_DENIED":
      return httpError(403, error.code, "You are not authorized to perform this action.");
    case "APPOINTMENT_STATE_INVALID":
      return httpError(409, error.code, "Appointment state does not allow this action.");
    case "APPOINTMENT_SLOT_CONFLICT":
      return httpError(409, error.code, "The selected Dentist is already booked for that time.");
    case "APPOINTMENT_PERSISTENCE_ERROR":
      return httpError(503, error.code, "Appointment service is temporarily unavailable.");
  }
}
