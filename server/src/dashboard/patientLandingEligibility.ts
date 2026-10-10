import type { AuthorizationContext } from "../services/authorizationService.js";
import type { PatientAccountRepository } from "../repositories/patientAccountRepository.js";
import { createPatientOwnershipService } from "../services/patientOwnershipService.js";

/** Verify an actual active OWN link; a Patient role alone is never sufficient. */
export async function requirePatientDashboardLink(
  context: AuthorizationContext,
  repository: PatientAccountRepository
): Promise<void> {
  if (!context.roles.includes("PATIENT")) return;
  await createPatientOwnershipService(repository).requireOwnPatient(context, "portal.profile.read");
}
