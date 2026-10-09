import type {
  AuthorizationRepository,
  PermissionCode,
  PermissionGrant
} from "../repositories/authorizationRepository.js";
import type { ApplicationUserContext } from "./applicationUserService.js";
import { AuthorizationError, toAuthorizationPersistenceError } from "./authorizationErrors.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AuthorizationContext extends ApplicationUserContext {
  permissions: PermissionGrant[];
}

export interface AuthorizationService {
  resolveContext(applicationUser: ApplicationUserContext): Promise<AuthorizationContext>;
  requirePermission(context: AuthorizationContext, permission: PermissionCode): void;
  requireAnyBranchPermission(context: AuthorizationContext, permission: PermissionCode): void;
  requireBranchPermission(context: AuthorizationContext, permission: PermissionCode, branchId: string): void;
}

function normalizeBranchId(branchId: string): string {
  const normalized = branchId.trim().toLowerCase();
  if (!uuidPattern.test(normalized)) {
    throw new AuthorizationError("AUTHORIZATION_BRANCH_INVALID");
  }
  return normalized;
}

function findGrant(context: AuthorizationContext, permission: PermissionCode): PermissionGrant {
  const grant = context.permissions.find((candidate) => candidate.code === permission);
  if (!grant) throw new AuthorizationError("AUTHORIZATION_DENIED");
  return grant;
}

export function createAuthorizationService(repository: AuthorizationRepository): AuthorizationService {
  return {
    async resolveContext(applicationUser) {
      try {
        const permissions = await repository.listEffectivePermissionGrants(applicationUser.roles);
        return {
          ...applicationUser,
          roles: [...applicationUser.roles].sort(),
          branchIds: [...applicationUser.branchIds].sort(),
          permissions: [...permissions].sort((left, right) => left.code.localeCompare(right.code))
        };
      } catch (error) {
        throw toAuthorizationPersistenceError(error);
      }
    },

    requirePermission(context, permission) {
      const grant = findGrant(context, permission);
      if (grant.scope === "OWN") {
        throw new AuthorizationError("AUTHORIZATION_OWNERSHIP_NOT_IMPLEMENTED");
      }
      if (grant.scope === "BRANCH") {
        throw new AuthorizationError("AUTHORIZATION_BRANCH_REQUIRED");
      }
    },

    requireAnyBranchPermission(context, permission) {
      const grant = findGrant(context, permission);
      if (grant.scope === "OWN") {
        throw new AuthorizationError("AUTHORIZATION_OWNERSHIP_NOT_IMPLEMENTED");
      }
      if (grant.scope === "GLOBAL") return;
      if (context.branchIds.length === 0) {
        throw new AuthorizationError("AUTHORIZATION_DENIED");
      }
    },

    requireBranchPermission(context, permission, branchId) {
      const normalizedBranchId = normalizeBranchId(branchId);
      const grant = findGrant(context, permission);

      if (grant.scope === "OWN") {
        throw new AuthorizationError("AUTHORIZATION_OWNERSHIP_NOT_IMPLEMENTED");
      }
      if (grant.scope === "GLOBAL") return;

      if (!context.branchIds.includes(normalizedBranchId)) {
        throw new AuthorizationError("AUTHORIZATION_DENIED");
      }
    }
  };
}
