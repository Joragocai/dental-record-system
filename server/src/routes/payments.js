import express from "express";
import {createAuthenticateMiddleware} from "../auth/authMiddleware.js";
import {createAccessBoundary} from "../access/accessMiddleware.js";
import {createFinanceCollectionRuntime} from "../finance/financeCollectionRuntime.ts";
export function createPaymentRouter(auth,boundary=createAccessBoundary(),runtime=createFinanceCollectionRuntime()){
 const router=express.Router(),guard=[createAuthenticateMiddleware(auth),boundary.resolveApplicationUser,boundary.resolveAuthorization];
 router.post("/",...guard,boundary.requireAnyBranchPermission("finance.payment.record"),async(req,res,next)=>{
  try{const ctx=res.locals.authorization,rid=res.locals.requestId;
   if(!ctx||!rid)throw Error("Finance authorization unavailable.");
   res.status(201).json(await runtime.getService().record(ctx,rid,req.body));
  }catch(error){next(error)}
 });
 router.get("/:paymentId",...guard,boundary.requireAnyBranchPermission("finance.payment.read"),async(req,res,next)=>{
  try{const ctx=res.locals.authorization;
   if(!ctx)throw Error("Finance authorization unavailable.");
   res.json(await runtime.getService().read(ctx,req.params.paymentId));
  }catch(error){next(error)}
 });
 router.post("/:paymentId/reverse",...guard,boundary.requireAnyBranchPermission("finance.payment.reverse"),async(req,res,next)=>{
  try{const ctx=res.locals.authorization,rid=res.locals.requestId;
   if(!ctx||!rid)throw Error("Finance authorization unavailable.");
   res.json(await runtime.getService().reverse(ctx,rid,req.params.paymentId,req.body));
  }catch(error){next(error)}
 });
 return router;
}
export function createRefundRouter(auth,boundary=createAccessBoundary(),runtime=createFinanceCollectionRuntime()){
 const router=express.Router();
 router.post("/",createAuthenticateMiddleware(auth),boundary.resolveApplicationUser,boundary.resolveAuthorization,
 boundary.requireAnyBranchPermission("finance.refund.record"),async(req,res,next)=>{
  try{const ctx=res.locals.authorization,rid=res.locals.requestId;
   if(!ctx||!rid)throw Error("Finance authorization unavailable.");
   res.status(201).json(await runtime.getService().refund(ctx,rid,req.body));
  }catch(error){next(error)}
 });
 return router;
}
