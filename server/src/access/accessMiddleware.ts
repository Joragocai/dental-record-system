import type { AuthenticatedPrincipal } from "../auth/authVerifier.js";
import type { PermissionCode } from "../repositories/authorizationRepository.js";
import { ApplicationUserError } from "../services/applicationUserErrors.js";
import type { ApplicationUserContext, ApplicationUserService } from "../services/applicationUserService.js";
import { AuthorizationError } from "../services/authorizationErrors.js";
import type { AuthorizationContext, AuthorizationService } from "../services/authorizationService.js";
import { createAccessRuntime, type AccessRuntime, type AccessRuntimeServices } from "./accessRuntime.js";

export interface AccessLocals {
  auth?: AuthenticatedPrincipal;
  applicationUser?: ApplicationUserContext;
  authorization?: AuthorizationContext;
}

export interface AccessRequestLike {
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
}

export interface AccessResponseLike {
  locals: AccessLocals;
}

export type AccessNextFunction = (error?: unknown) => void;
export type BranchIdExtractor = (req: AccessRequestLike) => string;

export interface HttpAccessError extends Error {
  status: number;
  code: string;
}

export interface AccessBoundary {
  resolveApplicationUser: (
    req: AccessRequestLike,
    res: AccessResponseLike,
    next: AccessNextFunction
  ) => Promise<void>;
  resolveAuthorization: (
    req: AccessRequestLike,
    res: AccessResponseLike,
    next: AccessNextFunction
  ) => Promise<void>;
  requirePermission(permission: PermissionCode): (
    req: AccessRequestLike,
    res: AccessResponseLike,
    next: AccessNextFunction
  ) => void;
  requireBranchPermission(permission: PermissionCode, extractBranchId: BranchIdExtractor): (
    req: AccessRequestLike,
    res: AccessResponseLike,
    next: AccessNextFunction
  ) => void;
}

function createHttpAccessError(status: number, code: string, message: string): HttpAccessError {
  const error = new Error(message) as HttpAccessError;
  error.name = "AccessBoundaryError";
  error.status = status;
  error.code = code;
  return error;
}

function toSafeApplicationUserHttpError(error: unknown): HttpAccessError {
  if (error instanceof ApplicationUserError) {
    switch (error.code) {
      case "APPLICATION_USER_NOT_FOUND":
      case "APPLICATION_USER_PENDING":
      case "APPLICATION_USER_INACTIVE":
        return createHttpAccessError(403, "ACCESS_DENIED", "You are not authorized to access this resource.");
      case "INVALID_AUTH_IDENTITY":
      case "APPLICATION_USER_DATA_INVALID":
        return createHttpAccessError(500, "ACCESS_CONTEXT_INVALID", "Access could not be evaluated safely.");
      case "APPLICATION_USER_PERSISTENCE_ERROR":
        return createHttpAccessError(503, "ACCESS_CONTEXT_UNAVAILABLE", "Access information is temporarily unavailable.");
    }
  }

  return createHttpAccessError(503, "ACCESS_CONTEXT_UNAVAILABLE", "Access information is temporarily unavailable.");
}

function toSafeAuthorizationHttpError(error: unknown): HttpAccessError {
  if (error instanceof AuthorizationError) {
    if (error.code === "AUTHORIZATION_PERSISTENCE_ERROR") {
      return createHttpAccessError(503, "AUTHORIZATION_UNAVAILABLE", "Authorization is temporarily unavailable.");
    }
    return createHttpAccessError(error.status, error.code, error.message);
  }

  return createHttpAccessError(503, "AUTHORIZATION_UNAVAILABLE", "Authorization is temporarily unavailable.");
}

function requireAuthPrincipal(res: AccessResponseLike): AuthenticatedPrincipal {
  const principal = res.locals.auth;
  if (!principal) {
    throw createHttpAccessError(500, "ACCESS_PIPELINE_INVALID", "Access could not be evaluated safely.");
  }
  return principal;
}

function requireApplicationUser(res: AccessResponseLike): ApplicationUserContext {
  const applicationUser = res.locals.applicationUser;
  if (!applicationUser) {
    throw createHttpAccessError(500, "ACCESS_PIPELINE_INVALID", "Access could not be evaluated safely.");
  }
  return applicationUser;
}

function requireAuthorizationContext(res: AccessResponseLike): AuthorizationContext {
  const authorization = res.locals.authorization;
  if (!authorization) {
    throw createHttpAccessError(500, "ACCESS_PIPELINE_INVALID", "Access could not be evaluated safely.");
  }
  return authorization;
}

export function createAccessBoundary(options: {
  runtime?: AccessRuntime;
  getServices?: () => AccessRuntimeServices;
} = {}): AccessBoundary {
  const runtime = options.runtime ?? createAccessRuntime();
  const getServices = options.getServices ?? (() => runtime.getServices());

  return {
    async resolveApplicationUser(_req, res, next) {
      try {
        const principal = requireAuthPrincipal(res);
        const { applicationUserService } = getServices();
        res.locals.applicationUser = await applicationUserService.resolveByAuthUserId(principal.subject);
        next();
      } catch (error) {
        if (error instanceof Error && "status" in error) {
          next(error);
          return;
        }
        next(toSafeApplicationUserHttpError(error));
      }
    },

    async resolveAuthorization(_req, res, next) {
      try {
        const applicationUser = requireApplicationUser(res);
        const { authorizationService } = getServices();
        res.locals.authorization = await authorizationService.resolveContext(applicationUser);
        next();
      } catch (error) {
        if (error instanceof Error && "status" in error) {
          next(error);
          return;
        }
        next(toSafeAuthorizationHttpError(error));
      }
    },

    requirePermission(permission) {
      return (_req, res, next) => {
        try {
          const authorization = requireAuthorizationContext(res);
          const { authorizationService } = getServices();
          authorizationService.requirePermission(authorization, permission);
          next();
        } catch (error) {
          if (error instanceof Error && "status" in error) {
            next(error);
            return;
          }
          next(toSafeAuthorizationHttpError(error));
        }
      };
    },

    requireBranchPermission(permission, extractBranchId) {
      return (req, res, next) => {
        try {
          const authorization = requireAuthorizationContext(res);
          const branchId = extractBranchId(req);
          const { authorizationService } = getServices();
          authorizationService.requireBranchPermission(authorization, permission, branchId);
          next();
        } catch (error) {
          if (error instanceof Error && "status" in error) {
            next(error);
            return;
          }
          next(toSafeAuthorizationHttpError(error));
        }
      };
    }
  };
}
