import express from "express";
import { createAuthenticateMiddleware } from "../auth/authMiddleware.js";
import { createAccessBoundary } from "../access/accessMiddleware.js";
import { createAttachmentRuntime } from "../attachments/attachmentRuntime.js";
import {
  requireAttachmentUuid,
  validateAttachmentIntentInput
} from "../attachments/attachmentValidation.js";

function actorFromResponse(res) {
  const applicationUser = res.locals.applicationUser;
  const requestId = res.locals.requestId;
  if (!applicationUser?.userId || !applicationUser?.authUserId || !requestId) {
    const error = new Error("Attachment access context is unavailable.");
    error.status = 500;
    throw error;
  }
  return {
    userId: applicationUser.userId,
    authUserId: applicationUser.authUserId,
    requestId
  };
}

function loadAttachmentAccess(runtime, getId) {
  return async (req, res, next) => {
    try {
      const attachmentId = requireAttachmentUuid(getId(req));
      const context = await runtime.getService().getAccessContext(attachmentId);
      req.attachmentAccess = context;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createAttachmentsRouter(
  authenticationService,
  accessBoundary = createAccessBoundary(),
  attachmentRuntime = createAttachmentRuntime()
) {
  const router = express.Router();
  const authenticate = createAuthenticateMiddleware(authenticationService);

  router.post(
    "/upload-intent",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    (req, _res, next) => {
      try {
        req.attachmentIntent = validateAttachmentIntentInput(req.body ?? {});
        next();
      } catch (error) {
        next(error);
      }
    },
    accessBoundary.requireBranchPermission("attachment.create", (req) => req.attachmentIntent.branchId),
    async (req, res, next) => {
      try {
        const result = await attachmentRuntime.getService().createUploadIntent(
          req.attachmentIntent,
          actorFromResponse(res)
        );
        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/complete",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    (req, _res, next) => {
      try {
        req.attachmentId = requireAttachmentUuid(req.body?.attachmentId);
        next();
      } catch (error) {
        next(error);
      }
    },
    loadAttachmentAccess(attachmentRuntime, (req) => req.attachmentId),
    accessBoundary.requireBranchPermission("attachment.create", (req) => req.attachmentAccess.branchId),
    async (req, res, next) => {
      try {
        const result = await attachmentRuntime.getService().complete(req.attachmentId, actorFromResponse(res));
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/:attachmentId/download-url",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    loadAttachmentAccess(attachmentRuntime, (req) => req.params.attachmentId),
    accessBoundary.requireBranchPermission("attachment.download", (req) => req.attachmentAccess.branchId),
    async (req, res, next) => {
      try {
        const result = await attachmentRuntime.getService().createDownloadUrl(
          req.params.attachmentId,
          actorFromResponse(res)
        );
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/:attachmentId",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    loadAttachmentAccess(attachmentRuntime, (req) => req.params.attachmentId),
    accessBoundary.requireBranchPermission("attachment.read", (req) => req.attachmentAccess.branchId),
    async (req, res, next) => {
      try {
        const result = await attachmentRuntime.getService().view(req.params.attachmentId, actorFromResponse(res));
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch(
    "/:attachmentId",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    loadAttachmentAccess(attachmentRuntime, (req) => req.params.attachmentId),
    accessBoundary.requireBranchPermission("attachment.update", (req) => req.attachmentAccess.branchId),
    async (req, res, next) => {
      try {
        const result = await attachmentRuntime.getService().updateMetadata(
          req.params.attachmentId,
          req.body ?? {},
          actorFromResponse(res)
        );
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete(
    "/:attachmentId",
    authenticate,
    accessBoundary.resolveApplicationUser,
    accessBoundary.resolveAuthorization,
    loadAttachmentAccess(attachmentRuntime, (req) => req.params.attachmentId),
    accessBoundary.requireBranchPermission("attachment.delete", (req) => req.attachmentAccess.branchId),
    async (req, res, next) => {
      try {
        const result = await attachmentRuntime.getService().deleteAttachment(
          req.params.attachmentId,
          actorFromResponse(res)
        );
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createAttachmentsRouter();
