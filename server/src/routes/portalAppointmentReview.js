import express from "express";
import {createAuthenticateMiddleware} from "../auth/authMiddleware.js";
import {createAccessBoundary} from "../access/accessMiddleware.js";
import {createPgPoolManager} from "../postgres/pool.ts";
import {buildPgFoundationConfig} from "../postgres/config.ts";
import {createPortalAppointmentReviewService} from "../services/portalAppointmentReviewService.ts";
import {AppointmentDomainError} from "../services/appointmentDomainErrors.ts";
import {toAppointmentHttpError} from "../services/appointmentHttpErrors.ts";
export function createPortalAppointmentReviewRouter(authService,boundary=createAccessBoundary(),providedService=null){
 const router=express.Router();let service=providedService;
 const get=()=>service??(service=createPortalAppointmentReviewService(createPgPoolManager(buildPgFoundationConfig())));
 const access=[createAuthenticateMiddleware(authService),boundary.resolveApplicationUser,boundary.resolveAuthorization];
 const handler=action=>async(req,res,next)=>{try{
  const ctx=res.locals.authorization,rid=res.locals.requestId;
  if(!ctx||!rid)throw new Error("Appointment review identity unavailable.");
  res.json(await action(get(),ctx,rid,req));
 }catch(error){next(error instanceof AppointmentDomainError?toAppointmentHttpError(error):error)}};
 router.get("/",...access,handler((s,c,r,req)=>s.pending(c,req.query.branchId)));
 router.post("/:requestId/decision",...access,handler((s,c,r,req)=>s.decide(c,r,req.params.requestId,req.body)));
 return router;
}
