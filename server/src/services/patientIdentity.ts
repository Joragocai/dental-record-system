import { PatientDomainError } from "./patientDomainErrors.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const patientCodePattern = /^P-\d{4}-\d{4}$/;

export function normalizePatientId(patientId: string): string {
  const normalized = String(patientId ?? "").trim();
  if (!uuidPattern.test(normalized)) {
    throw new PatientDomainError("INVALID_IDENTITY", ["Patient ID must be a valid UUID."]);
  }
  return normalized;
}

export function normalizePatientCode(patientCode: string): string {
  const normalized = String(patientCode ?? "").trim();
  if (!patientCodePattern.test(normalized)) {
    throw new PatientDomainError("INVALID_IDENTITY", ["Patient code must use P-YYYY-0001 format."]);
  }
  return normalized;
}
