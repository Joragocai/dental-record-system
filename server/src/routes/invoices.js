import express from "express";
import {createAuthenticateMiddleware} from "../auth/authMiddleware.js";
import {createAccessBoundary} from "../access/accessMiddleware.js";
import {createInvoiceRuntime} from "../finance/invoiceRuntime.ts";
export function createInvoiceRouter(authService,boundary=createAccessBoundary(),runtime=createInvoiceRuntime()){
 const router=express.Router();
 const guard=[createAuthenticateMiddleware(authService),boundary.resolveApplicationUser,boundary.resolveAuthorization];
 router.post("/",...guard,boundary.requireAnyBranchPermission("finance.invoice.draft"),async(req,res,next)=>{
  try{
   const ctx=res.locals.authorization,rid=res.locals.requestId;
   if(!ctx||!rid)throw Error("Finance authorization unavailable.");
   res.status(201).json(await runtime.getService().draft(ctx,rid,req.body));
  }catch(e){next(e)}
 });
 router.get("/:invoiceId",...guard,boundary.requireAnyBranchPermission("finance.invoice.read"),async(req,res,next)=>{
  try{
   const ctx=res.locals.authorization,rid=res.locals.requestId;
   if(!ctx||!rid)throw Error("Finance authorization unavailable.");
   res.json(await runtime.getService().read(ctx,rid,req.params.invoiceId));
  }catch(e){next(e)}
 });
 for(const [action,permission] of [["finalize","finance.invoice.finalize"],["void","finance.invoice.void"]]){
  router.post("/:invoiceId/"+action,...guard,boundary.requireAnyBranchPermission(permission),async(req,res,next)=>{
   try{
    const ctx=res.locals.authorization,rid=res.locals.requestId;
    if(!ctx||!rid)throw Error("Finance authorization unavailable.");
    res.json(await runtime.getLifecycle()[action](ctx,rid,req.params.invoiceId,req.body));
   }catch(e){next(e)}
  });
 }
 return router;
}
