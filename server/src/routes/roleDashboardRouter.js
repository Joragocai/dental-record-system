import express from "express";
import { createAuthenticateMiddleware } from "../auth/authMiddleware.js";
import { createAccessBoundary } from "../access/accessMiddleware.js";
import { sendDashboardContext } from "./dashboardV2.ts";

export function createDashboardV2Router(authenticationService, accessBoundary = createAccessBoundary()) {
  const router = express.Router();
  router.get("/context",
    createAuthenticateMiddleware(authenticationService),
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    (_req, res) => sendDashboardContext(res)
  );
  return router;
}
