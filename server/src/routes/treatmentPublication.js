import express from "express";
import {createAuthenticateMiddleware} from "../auth/authMiddleware.js";
import {createAccessBoundary} from "../access/accessMiddleware.js";
import {createPortalRecordsService} from "../services/portalRecordsService.ts";
import {createPgPoolManager} from "../postgres/pool.ts";
import {buildPgFoundationConfig} from "../postgres/config.ts";
export function createTreatmentPublicationRouter(authService,boundary=createAccessBoundary(),providedService=null){
 const router=express.Router();let service=providedService;
 const get=()=>service??(service=createPortalRecordsService(createPgPoolManager(buildPgFoundationConfig())));
 router.post("/:treatmentId/publish",createAuthenticateMiddleware(authService),
  boundary.resolveApplicationUser,boundary.resolveAuthorization,
  boundary.requireAnyBranchPermission("treatment.publish"),
  async(req,res,next)=>{
   try{
    const context=res.locals.authorization,requestId=res.locals.requestId;
    if(!context||!requestId)throw new Error("Publication context unavailable.");
    const result=await get().publish(context,requestId,req.params.treatmentId,req.body?.summary);
    res.json(result);
   }catch(err){next(err)}
  });
 return router;
}
