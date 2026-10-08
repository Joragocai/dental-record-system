import express from "express";
import { createAuthenticateMiddleware } from "../auth/authMiddleware.js";
import { createAccessBoundary } from "../access/accessMiddleware.js";
import { createAuditReviewRuntime } from "../audit/auditReviewRuntime.js";

function actorFromResponse(res) {
  const applicationUser = res.locals.applicationUser;
  const requestId = res.locals.requestId;
  if (!applicationUser?.userId || !applicationUser?.authUserId || !requestId) {
    const error = new Error("Audit access context is unavailable.");
    error.status = 500;
    throw error;
  }
  return {
    userId: applicationUser.userId,
    authUserId: applicationUser.authUserId,
    requestId
  };
}

export function createAuditEventsRouter(
  authenticationService,
  accessBoundary = createAccessBoundary(),
  auditRuntime = createAuditReviewRuntime()
) {
  const router = express.Router();
  const authenticate = createAuthenticateMiddleware(authenticationService);

  router.get(
    "/",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    accessBoundary.requirePermission("audit.read"),
    async (req, res, next) => {
      try {
        const result = await auditRuntime.getService().list(req.query ?? {}, actorFromResponse(res));
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/:auditEventId",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    accessBoundary.requirePermission("audit.read"),
    async (req, res, next) => {
      try {
        const result = await auditRuntime.getService().detail(req.params.auditEventId, actorFromResponse(res));
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/export",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    accessBoundary.requirePermission("audit.export"),
    async (req, res, next) => {
      try {
        const csv = await auditRuntime.getService().exportCsv(req.body ?? {}, actorFromResponse(res));
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="audit-events.csv"');
        res.send(csv);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createAuditEventsRouter;
