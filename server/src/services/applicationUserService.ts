import type {
  ApplicationRoleCode,
  ApplicationUserRepository,
  ApplicationUserStatus
} from "../repositories/applicationUserRepository.js";
import { ApplicationUserError, toApplicationUserPersistenceError } from "./applicationUserErrors.js";
import { normalizeAuthUserId } from "./applicationUserIdentity.js";

export interface ApplicationUserContext {
  userId: string;
  authUserId: string;
  email: string;
  displayName: string;
  status: ApplicationUserStatus;
  roles: ApplicationRoleCode[];
  branchIds: string[];
}

export interface ApplicationUserService {
  resolveByAuthUserId(authUserId: string): Promise<ApplicationUserContext>;
}

export function createApplicationUserService(repository: ApplicationUserRepository): ApplicationUserService {
  return {
    async resolveByAuthUserId(authUserId) {
      const normalizedAuthUserId = normalizeAuthUserId(authUserId);

      try {
        const user = await repository.getByAuthUserId(normalizedAuthUserId);
        if (!user) {
          throw new ApplicationUserError("APPLICATION_USER_NOT_FOUND");
        }
        if (user.authUserId !== normalizedAuthUserId) {
          throw new ApplicationUserError("APPLICATION_USER_DATA_INVALID");
        }
        if (user.status === "pending") {
          throw new ApplicationUserError("APPLICATION_USER_PENDING");
        }
        if (user.status === "suspended" || user.status === "deactivated") {
          throw new ApplicationUserError("APPLICATION_USER_INACTIVE");
        }

        const [roles, branchIds] = await Promise.all([
          repository.listRoleCodes(user.id),
          repository.listBranchIds(user.id)
        ]);

        return {
          userId: user.id,
          authUserId: normalizedAuthUserId,
          email: user.email,
          displayName: user.displayName,
          status: user.status,
          roles: [...roles].sort(),
          branchIds: [...branchIds].sort()
        };
      } catch (error) {
        throw toApplicationUserPersistenceError(error);
      }
    }
  };
}
