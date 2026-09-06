import express from "express";
import { createAuthenticateMiddleware } from "../auth/authMiddleware.js";
import { createAccessBoundary } from "../access/accessMiddleware.js";
import { createStaffAccountRuntime } from "../staff/staffAccountRuntime.js";

export function createStaffAccountsRouter(
  authenticationService,
  accessBoundary = createAccessBoundary(),
  staffAccountRuntime = createStaffAccountRuntime()
) {
  const router = express.Router();
  const authenticate = createAuthenticateMiddleware(authenticationService);

  router.post(
    "/",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    accessBoundary.requirePermission("staff_account.create"),
    accessBoundary.requirePermission("role_assignment.approve"),
    async (req, res, next) => {
      try {
        const created = await staffAccountRuntime.getService().createPendingStaffAccount(req.body ?? {});
        res.status(201).json(created);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createStaffAccountsRouter();
