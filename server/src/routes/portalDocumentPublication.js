import express from "express";
import {createAuthenticateMiddleware} from "../auth/authMiddleware.js";
import {createAccessBoundary} from "../access/accessMiddleware.js";
import {createPgPoolManager} from "../postgres/pool.ts";
import {buildPgFoundationConfig} from "../postgres/config.ts";
import {createPortalDocumentPublicationService} from "../services/portalDocumentPublicationService.ts";
export function createPortalDocumentPublicationRouter(authService,boundary=createAccessBoundary(),providedService=null){
 const router=express.Router();let service=providedService;
 const get=()=>service??(service=createPortalDocumentPublicationService(createPgPoolManager(buildPgFoundationConfig())));
 router.patch("/:documentId/patient-visibility",createAuthenticateMiddleware(authService),
  boundary.resolveApplicationUser,boundary.resolveAuthorization,
  boundary.requireAnyBranchPermission("attachment.update"),
  async(req,res,next)=>{try{
   const ctx=res.locals.authorization,rid=res.locals.requestId;
   if(!ctx||!rid)throw Error("Document publication context unavailable.");
   res.json(await get().setVisible(ctx,rid,req.params.documentId,req.body));
  }catch(error){next(error)}});
 return router;
}
