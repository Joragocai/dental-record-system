import type { ApplicationUserContext } from "./applicationUserService.js";
import type { AuthorizationContext } from "./authorizationService.js";
import type { PatientAccountRepository } from "../repositories/patientAccountRepository.js";
import type { PermissionCode } from "../repositories/authorizationRepository.js";
import { AuthorizationError } from "./authorizationErrors.js";

export const portalOwnPermissions = [
  "portal.profile.read",
  "portal.profile.update",
  "portal.treatments.read",
  "portal.appointments.read",
  "portal.appointments.request",
  "portal.documents.read",
  "portal.balance.read",
  "portal.payments.read"
] as const;

export type PortalOwnPermission = (typeof portalOwnPermissions)[number];

/** This is a backend-only boundary, not a general-purpose OWN bypass. */
export function createPatientOwnershipService(repository: PatientAccountRepository) {
  return {
    async requireOwnPatient(context: AuthorizationContext, permission: PortalOwnPermission): Promise<string> {
      if (
        context.status !== "active" ||
        context.roles.length !== 1 ||
        context.roles[0] !== "PATIENT" ||
        context.branchIds.length !== 0 ||
        !portalOwnPermissions.includes(permission) ||
        !context.permissions.some((grant) => grant.code === permission && grant.scope === "OWN")
      ) {
        throw new AuthorizationError("AUTHORIZATION_DENIED");
      }

      let link;
      try {
        link = await repository.getByUserId(context.userId);
      } catch {
        throw new AuthorizationError("AUTHORIZATION_PERSISTENCE_ERROR");
      }
      if (!link || link.status !== "active" || link.appUserId !== context.userId) {
        throw new AuthorizationError("AUTHORIZATION_DENIED");
      }
      return link.patientId;
    }
  };
}
