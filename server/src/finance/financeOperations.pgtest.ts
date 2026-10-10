import assert from "node:assert/strict";
import test from "node:test";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {QueryResult,QueryResultRow} from "pg";
import type {AuthorizationContext} from "../services/authorizationService.js";
import {AuthorizationError} from "../services/authorizationErrors.js";
import {FinanceConflictError} from "./invoiceLifecycleService.js";
import {createFinanceOperationsService} from "./financeOperationsService.js";
const U="11111111-1111-4111-8111-111111111111",A="22222222-2222-4222-8222-222222222222",
B="33333333-3333-4333-8333-333333333333",P="44444444-4444-4444-8444-444444444444",
K="55555555-5555-4555-8555-555555555555",R="66666666-6666-4666-8666-666666666666";
const perms=["finance.receivables.read","finance.receivables.followup","finance.expense.create","finance.expense.read","finance.expense.approve","finance.supplier.create","finance.supplier.read","finance.payable.create","finance.payable.read","finance.payable.approve","finance.payable.pay"];
function actor(role:"PERSONNEL"|"CLINIC_ADMINISTRATOR"|"SYSTEM_ADMINISTRATOR"="PERSONNEL",branchIds=[B]):AuthorizationContext{
 return {userId:U,authUserId:A,email:"fiction@example.test",displayName:"Fiction",status:"active",roles:[role],branchIds,
 permissions:perms.map(code=>({code:code as typeof perms[number] & "finance.payable.pay",scope:code.includes(".approve")?"GLOBAL":"BRANCH"}))};
}
function fake(){
 const sqls:string[]=[];let updated=0;
 const db:PgQueryExecutor={async query<T extends QueryResultRow>(sql:string):Promise<QueryResult<T>>{
  sqls.push(sql);let rows:Record<string,unknown>[]=[];
  if(sql.includes("FROM accounts_payable WHERE id=$1 FOR UPDATE")){
   rows=[{branch_id:B,approval_status:"approved",outstanding_amount:"40.00",original_amount:"100.00"}];
  }else if(sql.includes("FROM payable_payments WHERE recorded_by"))rows=[];
  else if(sql.includes("FROM expenses WHERE id=$1 FOR UPDATE"))rows=[{branch_id:B,approval_status:"pending"}];
  else if(sql.includes("FROM accounts_payable WHERE id=$1 FOR UPDATE")===false&&sql.includes("FROM accounts_payable WHERE id=$1"))rows=[{branch_id:B,approval_status:"pending"}];
  if(sql.startsWith("UPDATE"))updated++;
  return{rows:rows as T[],rowCount:sql.startsWith("INSERT")||sql.startsWith("UPDATE")?1:rows.length,fields:[],command:"SELECT",oid:0};
 }};
 const pool:PgPoolManager={query:db.query,withTransaction:async cb=>cb(db),
 describeTarget:()=>({appEnv:"test",host:"localhost",port:5432,database:"fictional_test",username:"test",sslMode:"disable"}),isStarted:()=>true,shutdown:async()=>{}};
 return {svc:createFinanceOperationsService(pool),sqls,get updated(){return updated}};
}
test("supplier registration and expense drafts use authorized branch, audited pending records only",async()=>{
 const f=fake();
 const s=await f.svc.supplier(actor(),R,{branchId:B,name:"Fictional Dental Lab"});
 const e=await f.svc.expense(actor(),R,{branchId:B,expenseDate:"2026-10-10",categoryCode:"DENTAL_SUPPLIES",description:"Dental gloves",amount:"12.35"});
 assert.equal(s.status,"active");assert.equal(e.approvalStatus,"pending");assert.equal(e.paid,false);
 assert.equal(f.sqls.filter(x=>x.includes("INSERT INTO audit_events")).length,2);
 assert.equal(f.sqls.some(x=>x.includes("INSERT INTO payable_payments")),false);
});
test("technical role and other branch cannot create payable or read collectibles",async()=>{
 const f=fake();
 for(const a of [actor("SYSTEM_ADMINISTRATOR"),actor("PERSONNEL",[])]){
  await assert.rejects(f.svc.payable(a,R,{branchId:B,supplierId:P,billNumber:"F-1",billDate:"2026-10-10",amount:"30.00"}),AuthorizationError);
  await assert.rejects(f.svc.collectibles(a,B),AuthorizationError);
 }
 assert.equal(f.sqls.length,0);
});
test("payable payments cannot exceed the locked outstanding amount",async()=>{
 const f=fake();
 await assert.rejects(f.svc.payablePayment(actor(),R,P,{amount:"50.00",paymentMethod:"Cash",idempotencyKey:K}),FinanceConflictError);
 assert.equal(f.sqls.some(x=>x.includes("INSERT INTO payable_payments")),false);
});
test("staff cannot approve expenses; clinic admin review records audit",async()=>{
 const f=fake();
 await assert.rejects(f.svc.review(actor(),R,"expense",P,{decision:"approved"}),AuthorizationError);
 assert.equal(f.updated,0);
 const success=await f.svc.review(actor("CLINIC_ADMINISTRATOR"),R,"expense",P,{decision:"approved"});
 assert.equal(success.approvalStatus,"approved");assert.equal(f.updated,1);
 assert.ok(f.sqls.some(x=>x.includes("INSERT INTO audit_events")));
});
test("payable payment uses an append-only event and updates outstanding in one transaction",async()=>{
 const f=fake();
 const response=await f.svc.payablePayment(actor(),R,P,{amount:"10.00",paymentMethod:"GCash",idempotencyKey:K});
 assert.equal(response.status,"partial");
 assert.equal(f.updated,1);
 assert.ok(f.sqls.some(x=>x.includes("INSERT INTO payable_payments")));
 assert.ok(f.sqls.some(x=>x.includes("INSERT INTO audit_events")));
});
