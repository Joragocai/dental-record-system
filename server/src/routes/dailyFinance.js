import express from "express";
import {createAuthenticateMiddleware} from "../auth/authMiddleware.js";
import {createAccessBoundary} from "../access/accessMiddleware.js";
import {createDailyFinanceRuntime} from "../finance/dailyFinanceRuntime.ts";
export function createDailyFinanceRouter(auth,boundary=createAccessBoundary(),runtime=createDailyFinanceRuntime()){
 const router=express.Router();
 const guard=[createAuthenticateMiddleware(auth),boundary.resolveApplicationUser,boundary.resolveAuthorization];
 const wrap=fn=>async(req,res,next)=>{try{
  const c=res.locals.authorization,r=res.locals.requestId;
  if(!c||!r)throw Error("Finance access not established.");
  res.status(req.method==="POST"?201:200).json(await fn(runtime.getService(),c,r,req));
 }catch(e){next(e)}};
 router.get("/daily-summary",...guard,boundary.requireAnyBranchPermission("finance.daily.read"),wrap((s,c,r,req)=>s.summary(c,req.query.branchId,req.query.businessDate,r)));
 router.get("/reports/daily",...guard,boundary.requireAnyBranchPermission("finance.report.export"),async(req,res,next)=>{
  try{const c=res.locals.authorization,r=res.locals.requestId;if(!c||!r)throw Error("Finance access not established.");
   const report=await runtime.getService().export(c,r,req.query.branchId,req.query.businessDate);
   res.set("Cache-Control","no-store");res.set("Content-Disposition",'attachment; filename="'+report.filename+'"');
   res.type("text/csv").send(report.csv);
  }catch(e){next(e)}
 });
 router.post("/opening-cash",...guard,boundary.requirePermission("finance.opening.record"),wrap((s,c,r,req)=>s.opening(c,r,req.body)));
 router.post("/daily-closings",...guard,boundary.requireAnyBranchPermission("finance.closing.submit"),wrap((s,c,r,req)=>s.submit(c,r,req.body)));
 router.get("/daily-closings/:id",...guard,boundary.requireAnyBranchPermission("finance.daily.read"),wrap((s,c,r,req)=>s.read(c,req.params.id,r)));
 router.post("/daily-closings/:id/approve",...guard,boundary.requirePermission("finance.closing.approve"),wrap((s,c,r,req)=>s.review(c,r,req.params.id,req.body)));
 return router;
}
