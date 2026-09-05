import express from "express";
import { createAuthenticateMiddleware } from "../auth/authMiddleware.js";

export function createAuthRouter(authenticationService) {
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

  return router;
}

export default createAuthRouter();
