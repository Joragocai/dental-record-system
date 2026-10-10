import express from "express";
import {createAuthenticateMiddleware} from "../auth/authMiddleware.js";
import {createAccessBoundary} from "../access/accessMiddleware.js";
import {createPatientEnrollmentRuntime} from "../patient/patientEnrollmentRuntime.ts";
import {createPatientActivationRuntime} from "../patient/patientActivationRuntime.ts";

export function createPatientEnrollmentRouter(
 authenticationService,
 boundary=createAccessBoundary(),
 runtime=createPatientEnrollmentRuntime(),
 provisioningRuntime=createPatientActivationRuntime()
){
 const router=express.Router();
 router.post("/:userId/invite",
  createAuthenticateMiddleware(authenticationService),
  boundary.resolveApplicationUser,
  boundary.resolveAuthorization,
  boundary.requireAnyBranchPermission("patient.read"),
  boundary.requireAnyBranchPermission("patient.create"),
  async(req,res,next)=>{
   try{
    const actor=res.locals.applicationUser;
    const authorization=res.locals.authorization;
    const requestId=res.locals.requestId;
    if(!actor||!authorization||!requestId){
      const error=new Error("Invitation authorization unavailable.");
      error.status=500;throw error;
    }
    const result=await provisioningRuntime.getServices().provisioning.invite(req.params.userId,{
      userId:actor.userId,authUserId:actor.authUserId,requestId,authorization
    });
    res.status(result.invitation==="sent"?202:200).json(result);
   }catch(error){next(error)}
  }
 );
 router.post(
  "/",
  createAuthenticateMiddleware(authenticationService),
  boundary.resolveApplicationUser,
  boundary.resolveAuthorization,
  boundary.requireAnyBranchPermission("patient.read"),
  boundary.requireAnyBranchPermission("patient.create"),
  async(req,res,next)=>{
   try{
    const authorization=res.locals.authorization;
    const actor=res.locals.applicationUser;
    const requestId=res.locals.requestId;
    if(!actor||!authorization||!requestId){
     const e=new Error("Enrollment context is unavailable.");e.status=500;throw e;
    }
    const result=await runtime.getService().createPending(req.body??{},{
     userId:actor.userId,authUserId:actor.authUserId,requestId,authorization
    });
    res.status(201).json(result);
   }catch(e){next(e)}
  }
 );
 return router;
}
export default createPatientEnrollmentRouter();
