import express from "express";
import { createAuthenticateMiddleware } from "../auth/authMiddleware.js";
import { createAccessBoundary } from "../access/accessMiddleware.js";

export function createAuthRouter(authenticationService, accessBoundary = createAccessBoundary()) {
  const router = express.Router();
  const authenticate = createAuthenticateMiddleware(authenticationService);

  router.get("/session", authenticate, (_req, res) => {
    const principal = res.locals.auth;
    res.json({
      authenticated: true,
      user: {
        id: principal.subject,
        email: principal.email
      }
    });
  });

  router.get(
    "/access",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    accessBoundary.requirePermission("user.read"),
    (_req, res) => {
      res.json({ authorized: true });
    }
  );

  return router;
}

export default createAuthRouter();
