import express from "express";
import {createAuthenticateMiddleware} from "../auth/authMiddleware.js";
import {createAccessBoundary} from "../access/accessMiddleware.js";
import {createPortalAppointmentService} from "../services/portalAppointmentService.ts";
import {AppointmentDomainError} from "../services/appointmentDomainErrors.ts";
import {toAppointmentHttpError} from "../services/appointmentHttpErrors.ts";
import {createPgPoolManager} from "../postgres/pool.ts";
import {buildPgFoundationConfig} from "../postgres/config.ts";
export function createPortalAppointmentRouter(authService,boundary=createAccessBoundary(),providedService=null){
 const router=express.Router();let service=providedService;
 const get=()=>service??(service=createPortalAppointmentService(createPgPoolManager(buildPgFoundationConfig())));
 const access=[createAuthenticateMiddleware(authService),boundary.resolveApplicationUser,boundary.resolveAuthorization];
 const wrap=(action)=>async(req,res,next)=>{
  try{
   const ctx=res.locals.authorization,rid=res.locals.requestId;
   if(!ctx||!rid)throw new Error("Missing patient request context.");
   const result=await action(get(),ctx,rid,req);
   res.status(req.method==="POST"?(result.replayed?200:201):200).json(result);
  }catch(err){next(err instanceof AppointmentDomainError?toAppointmentHttpError(err):err)}
 };
 router.get("/appointment-branches",...access,wrap((s,c)=>s.branches(c)));
 router.post("/appointment-requests",...access,wrap((s,c,r,req)=>s.create(c,r,req.body)));
 router.get("/appointment-requests",...access,wrap((s,c)=>s.list(c)));
 router.post("/appointments/:appointmentId/cancel-request",...access,wrap((s,c,r,req)=>s.change(c,r,req.params.appointmentId,"cancel",req.body)));
 router.post("/appointments/:appointmentId/reschedule-request",...access,wrap((s,c,r,req)=>s.change(c,r,req.params.appointmentId,"reschedule",req.body)));
 return router;
}
