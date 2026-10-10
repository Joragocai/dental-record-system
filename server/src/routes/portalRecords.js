import express from "express";
import {createAuthenticateMiddleware} from "../auth/authMiddleware.js";
import {createAccessBoundary} from "../access/accessMiddleware.js";
import {createPgPoolManager} from "../postgres/pool.ts";
import {buildPgFoundationConfig} from "../postgres/config.ts";
import {createPortalRecordsService} from "../services/portalRecordsService.ts";
export function createPortalRecordsRouter(authService,boundary=createAccessBoundary(),providedService=null){
 const router=express.Router();
 let service=providedService;
 const getService=()=>service??(service=createPortalRecordsService(createPgPoolManager(buildPgFoundationConfig())));
 const access=[createAuthenticateMiddleware(authService),boundary.resolveApplicationUser,boundary.resolveAuthorization];
 function run(action){
  return async(req,res,next)=>{
   try{
    const context=res.locals.authorization,requestId=res.locals.requestId;
    if(!context||!requestId)throw new Error("Portal context unavailable.");
    res.json(await action(getService(),context,requestId,req));
   }catch(err){next(err)}
  };
 }
 router.get("/patient-profile",...access,run((s,c,r)=>s.profile(c,r)));
 router.patch("/patient-profile",...access,run((s,c,r,req)=>s.updateContact(c,r,req.body)));
 router.get("/treatments",...access,run((s,c,r)=>s.treatments(c,r)));
 router.get("/appointments",...access,run((s,c,r)=>s.appointments(c,r)));
 return router;
}
