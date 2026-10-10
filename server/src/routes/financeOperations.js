import express from "express";
import {createAuthenticateMiddleware} from "../auth/authMiddleware.js";
import {createAccessBoundary} from "../access/accessMiddleware.js";
import {createFinanceOperationsRuntime} from "../finance/financeOperationsRuntime.ts";
export function createFinanceOperationsRouter(auth,boundary=createAccessBoundary(),runtime=createFinanceOperationsRuntime()){
 const router=express.Router();
 const guard=[createAuthenticateMiddleware(auth),boundary.resolveApplicationUser,boundary.resolveAuthorization];
 const handler=fn=>async(req,res,next)=>{try{
  const ctx=res.locals.authorization,rid=res.locals.requestId;
  if(!ctx||!rid)throw Error("Finance identity unavailable.");
  const result=await fn(runtime.getService(),ctx,rid,req);
  res.status(req.method==="POST"?201:200).json(result);
 }catch(error){next(error)}};
 function get(path,grant,callback){router.get(path,...guard,boundary.requireAnyBranchPermission(grant),handler(callback))}
 function post(path,grant,callback){router.post(path,...guard,boundary.requireAnyBranchPermission(grant),handler(callback))}
 get("/receivables","finance.receivables.read",(s,c,_r,req)=>s.collectibles(c,req.query.branchId));
 post("/receivables/followups","finance.receivables.followup",(s,c,r,req)=>s.followup(c,r,req.body));
 get("/suppliers","finance.supplier.read",(s,c,_r,req)=>s.suppliers(c,req.query.branchId));
 post("/suppliers","finance.supplier.create",(s,c,r,req)=>s.supplier(c,r,req.body));
 get("/expenses","finance.expense.read",(s,c,_r,req)=>s.expenses(c,req.query.branchId));
 post("/expenses","finance.expense.create",(s,c,r,req)=>s.expense(c,r,req.body));
 get("/accounts-payable","finance.payable.read",(s,c,_r,req)=>s.payables(c,req.query.branchId));
 post("/accounts-payable","finance.payable.create",(s,c,r,req)=>s.payable(c,r,req.body));
 post("/accounts-payable/:payableId/payments","finance.payable.pay",(s,c,r,req)=>s.payablePayment(c,r,req.params.payableId,req.body));
 // Clinic-wide administrative approvals require separate GLOBAL permission.
 router.post("/expenses/:expenseId/approve",...guard,boundary.requirePermission("finance.expense.approve"),
  handler((s,c,r,req)=>s.review(c,r,"expense",req.params.expenseId,req.body)));
 router.post("/accounts-payable/:payableId/approve",...guard,boundary.requirePermission("finance.payable.approve"),
  handler((s,c,r,req)=>s.review(c,r,"payable",req.params.payableId,req.body)));
 return router;
}
