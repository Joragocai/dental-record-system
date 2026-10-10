import express from "express";
import {createAuthenticateMiddleware} from "../auth/authMiddleware.js";
import {createAccessBoundary} from "../access/accessMiddleware.js";
import {createPortalPrivacyRuntime} from "../patient/portalPrivacyRuntime.ts";
export function createPortalPrivacyRouter(authService,boundary=createAccessBoundary(),runtime=createPortalPrivacyRuntime()){
 const router=express.Router();
 const guard=[createAuthenticateMiddleware(authService),boundary.resolveApplicationUser,boundary.resolveAuthorization];
 const handler=fn=>async(req,res,next)=>{try{
  const context=res.locals.authorization,requestId=res.locals.requestId;
  if(!context||!requestId)throw new Error("Private portal authorization unavailable.");
  res.json(await fn(runtime.getServices(),context,requestId,req));
 }catch(error){next(error)}};
 router.get("/documents",...guard,handler((s,c,r)=>s.documents.list(c,r)));
 router.post("/documents/:documentId/download-url",...guard,handler((s,c,r,req)=>s.documents.download(c,r,req.params.documentId)));
 router.post("/account/deactivate",...guard,handler((s,c,r)=>s.account.deactivate(c,r)));
 return router;
}
