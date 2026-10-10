import express from "express";
import { createAuthenticateMiddleware } from "../auth/authMiddleware.js";
import { createAccessBoundary } from "../access/accessMiddleware.js";
import { checkHostedReadiness } from "../config/hostedReadiness.js";
import { getTechnicalStatus } from "../dashboard/technicalStatus.ts";

export function createTechnicalStatusRouter(authService, boundary = createAccessBoundary(), readiness = checkHostedReadiness) {
  const router = express.Router();
  router.get("/status",
    createAuthenticateMiddleware(authService),
    boundary.resolveApplicationUser,
    boundary.resolveAuthorization,
    async (_req, res, next) => {
      try {
        res.set("Cache-Control", "no-store");
        res.json(await getTechnicalStatus(res.locals.authorization, readiness));
      } catch (error) { next(error); }
    }
  );
  return router;
}
