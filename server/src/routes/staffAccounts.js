import express from "express";
import { createAuthenticateMiddleware } from "../auth/authMiddleware.js";
import { createAccessBoundary } from "../access/accessMiddleware.js";
import { createStaffAccountRuntime } from "../staff/staffAccountRuntime.js";
import { createStaffProvisioningRuntime } from "../staff/staffProvisioningRuntime.js";

export function createStaffAccountsRouter(
  authenticationService,
  accessBoundary = createAccessBoundary(),
  staffAccountRuntime = createStaffAccountRuntime(),
  staffProvisioningRuntime = createStaffProvisioningRuntime()
) {
  const router = express.Router();
  const authenticate = createAuthenticateMiddleware(authenticationService);

  router.post(
    "/:userId/invite",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    accessBoundary.requirePermission("staff_account.create"),
    accessBoundary.requirePermission("role_assignment.approve"),
    async (req, res, next) => {
      try {
        const applicationUser = res.locals.applicationUser;
        const result = await staffProvisioningRuntime.getService().invitePendingStaff({
          targetUserId: req.params.userId,
          actorUserId: applicationUser.userId,
          actorAuthUserId: applicationUser.authUserId,
          requestId: res.locals.requestId
        });
        res.status(result.invitation === "sent" ? 202 : 200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/activate",
    authenticate,
    async (_req, res, next) => {
      try {
        const principal = res.locals.auth;
        const result = await staffProvisioningRuntime.getService().activateInvitedStaff({
          authUserId: principal.subject,
          email: principal.email,
          requestId: res.locals.requestId
        });
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    accessBoundary.requirePermission("staff_account.create"),
    accessBoundary.requirePermission("role_assignment.approve"),
    async (req, res, next) => {
      try {
        const applicationUser = res.locals.applicationUser;
        const created = await staffAccountRuntime.getService().createPendingStaffAccount(req.body ?? {}, {
          userId: applicationUser.userId,
          authUserId: applicationUser.authUserId,
          requestId: res.locals.requestId
        });
        res.status(201).json(created);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createStaffAccountsRouter();
