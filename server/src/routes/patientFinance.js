import express from "express";
import {createAuthenticateMiddleware} from "../auth/authMiddleware.js";
import {createAccessBoundary} from "../access/accessMiddleware.js";
import {buildPgFoundationConfig} from "../postgres/config.ts";
import {createPgPoolManager} from "../postgres/pool.ts";
import {createPatientFinanceService} from "../finance/patientFinanceService.ts";
export function createPatientFinanceRouter(auth,boundary=createAccessBoundary(),providedService=null){
 const router=express.Router();let service=providedService;
 const get=()=>service??(service=createPatientFinanceService(createPgPoolManager(buildPgFoundationConfig())));
 const access=[createAuthenticateMiddleware(auth),boundary.resolveApplicationUser,boundary.resolveAuthorization];
 const wrap=method=>async(req,res,next)=>{try{
  const c=res.locals.authorization,rid=res.locals.requestId;
  if(!c||!rid)throw Error("Patient identity unavailable.");
  res.json(await get()[method](c,rid));
 }catch(error){next(error)}};
 router.get("/balance",...access,wrap("balance"));
 router.get("/payments",...access,wrap("payments"));
 return router;
}
