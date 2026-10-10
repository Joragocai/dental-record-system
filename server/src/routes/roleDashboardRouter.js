import express from "express";
import { createAuthenticateMiddleware } from "../auth/authMiddleware.js";
import { createAccessBoundary } from "../access/accessMiddleware.js";
import { sendDashboardContext } from "./dashboardV2.ts";
import { requirePatientDashboardLink } from "../dashboard/patientLandingEligibility.ts";
import { createPatientAccountRepository } from "../repositories/patientAccountRepository.ts";
import { createPgPoolManager } from "../postgres/pool.ts";
import { buildPgFoundationConfig } from "../postgres/config.ts";

export function createDashboardV2Router(authenticationService, accessBoundary = createAccessBoundary(), patientRepository = null) {
  let repository = patientRepository;
  const getRepository = () => repository ?? (repository = createPatientAccountRepository(createPgPoolManager(buildPgFoundationConfig())));
  const router = express.Router();
  router.get("/context",
    createAuthenticateMiddleware(authenticationService),
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    async (_req, res, next) => {
      try {
        if (res.locals.authorization?.roles.includes("PATIENT")) await requirePatientDashboardLink(res.locals.authorization, getRepository());
        sendDashboardContext(res);
      } catch (error) { next(error); }
    }
  );
  return router;
}
