import express from "express";
import {createAuthenticateMiddleware} from "../auth/authMiddleware.js";
import {createPatientActivationRuntime} from "../patient/patientActivationRuntime.ts";

export function createPatientActivationRouter(authenticationService,runtime=createPatientActivationRuntime()){
 const router=express.Router();
 router.post("/activate",createAuthenticateMiddleware(authenticationService),async(req,res,next)=>{
  try{
   const principal=res.locals.auth;
   const requestId=res.locals.requestId;
   const header=req.headers.authorization;
   if(!principal||!requestId||typeof header!=="string"||!/^Bearer [^\s]+$/i.test(header)){
    const error=new Error("Unable to verify invitation.");
    error.status=403;
    throw error;
   }
   const {identity,provisioning}=runtime.getServices();
   const verified=await identity.requireConfirmedEmail(header.slice(7),principal.subject);
   const result=await provisioning.activate(verified.authUserId,verified.email,true,requestId);
   res.json(result);
  }catch(e){next(e)}
 });
 return router;
}
