import assert from "node:assert/strict";
import test from "node:test";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {QueryResult,QueryResultRow} from "pg";
import type {AuthorizationContext} from "../services/authorizationService.js";
import {createFinanceCollectionService} from "./financeCollectionService.js";
import {AuthorizationError} from "../services/authorizationErrors.js";
import {FinanceConflictError} from "./invoiceLifecycleService.js";
const user="11111111-1111-4111-8111-111111111111",auth="22222222-2222-4222-8222-222222222222",
 branch="33333333-3333-4333-8333-333333333333",patient="44444444-4444-4444-8444-444444444444",
 invoiceA="55555555-5555-4555-8555-555555555555",invoiceB="66666666-6666-4666-8666-666666666666",
 key="77777777-7777-4777-8777-777777777777",correlation="88888888-8888-4888-8888-888888888888",
 pay="99999999-9999-4999-8999-999999999999",allocation="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function ctx(role:"PERSONNEL"|"SYSTEM_ADMINISTRATOR"="PERSONNEL",branches=[branch]):AuthorizationContext {
 return {userId:user,authUserId:auth,email:"fixture@example.test",displayName:"Fictional",status:"active",roles:[role],
  branchIds:branches,permissions:["finance.payment.record","finance.payment.read","finance.payment.reverse","finance.refund.record"].map(code=>({code:code as "finance.payment.record",scope:"BRANCH" as const}))};
}
function fixture(options:{invoiceStatus?:string;balance?:string;existingPayment?:boolean;wrongBranch?:boolean;refundAmount?:string;previousRefund?:string;paymentStatus?:string}={}){
 const logs:{sql:string;values?:readonly unknown[]}[]=[];let paymentRows=0,allocations=0;
 const db:PgQueryExecutor={async query<R extends QueryResultRow>(sql:string,values?:readonly unknown[]):Promise<QueryResult<R>>{
  logs.push({sql,values});let rows:Record<string,unknown>[]=[];let count=0;
  if(sql.includes("SELECT id,patient_id,branch_id,status,amount,request_fingerprint FROM payments WHERE received_by")){
   if(options.existingPayment)rows=[{id:pay,patient_id:patient,branch_id:branch,status:"posted",amount:"100.00",request_fingerprint:"mismatch"}];
  }else if(sql.includes("FROM invoices WHERE id=ANY")) {
   rows=(values?.[0] as string[]).map(id=>({id,patient_id:patient,branch_id:options.wrongBranch?"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb":branch,
    status:options.invoiceStatus??"finalized",total_amount:"100.00",amount_paid:"0.00",balance_due:options.balance??"100.00"}));
  }else if(sql.startsWith("SELECT COALESCE(SUM(pa.amount)"))rows=[{amount:"100.00"}];
  else if(sql.startsWith("SELECT COALESCE(SUM(r.amount)"))rows=[{amount:options.previousRefund??"0.00"}];
  else if(sql.startsWith("SELECT id FROM payments WHERE id=$1"))rows=[{id:pay}];
  else if(sql.startsWith("SELECT id,patient_id,branch_id,status,amount,request_fingerprint FROM payments WHERE id="))
    rows=[{id:pay,patient_id:patient,branch_id:branch,status:options.paymentStatus??"posted",amount:"100.00",request_fingerprint:"test"}];
  else if(sql.startsWith("SELECT invoice_id FROM payment_allocations"))rows=[{invoice_id:invoiceA}];
  else if(sql.startsWith("SELECT pa.id,pa.payment_id"))rows=[{id:allocation,payment_id:pay,invoice_id:invoiceA,branch_id:branch,amount:"100.00",status:"posted"}];
  else if(sql.startsWith("SELECT COALESCE(SUM(amount)"))rows=[{amount:options.previousRefund??"0.00"}];
  else if(sql.startsWith("SELECT 1 FROM refunds"))rows=[];
  if(sql.startsWith("INSERT INTO payments"))paymentRows++;
  if(sql.startsWith("INSERT INTO payment_allocations"))allocations++;
  if(sql.startsWith("UPDATE")||sql.startsWith("INSERT"))count=1;
  return {command:"",rowCount:count||rows.length,rows:rows as R[],oid:0,fields:[]};
 }};
 const pool:PgPoolManager={query:db.query,withTransaction:async cb=>cb(db),describeTarget:()=>({appEnv:"test",host:"localhost",port:5432,database:"fixture_test",username:"fixture",sslMode:"disable"}),isStarted:()=>true,shutdown:async()=>{}};
 return {svc:createFinanceCollectionService(pool),logs,get paymentRows(){return paymentRows},get allocations(){return allocations}};
}
function payBody(){return{amount:"100.00",paymentMethod:"GCash",idempotencyKey:key,invoiceAllocations:[{invoiceId:invoiceA,amount:"60.00"},{invoiceId:invoiceB,amount:"40.00"}]}}
test("posting multiple invoices allocates the exact total under invoice locks and audits",async()=>{
 const f=fixture();const value=await f.svc.record(ctx(),correlation,payBody());
 assert.equal(value.status,"posted");assert.equal(value.receiptNumber,null);
 assert.equal(f.paymentRows,1);assert.equal(f.allocations,2);
 assert.ok(f.logs.some(l=>l.sql.includes("FOR UPDATE")));
 assert.ok(f.logs.some(l=>l.sql.includes("INSERT INTO audit_events")));
});
test("payment allocation rejects overpayment, wrong branches, mixed roles and altered idempotency",async()=>{
 const full=fixture({balance:"50.00"});
 await assert.rejects(full.svc.record(ctx(),correlation,payBody()),FinanceConflictError);
 assert.equal(full.paymentRows,0);
 for(const actor of [ctx("SYSTEM_ADMINISTRATOR"),ctx("PERSONNEL",[])]){
  const f=fixture();await assert.rejects(f.svc.record(actor,correlation,payBody()),AuthorizationError);
  assert.equal(f.paymentRows,0);
 }
 const existing=fixture({existingPayment:true});
 await assert.rejects(existing.svc.record(ctx(),correlation,payBody()),FinanceConflictError);
});
test("payment reversal marks original reversed and recalculates invoice without deleting allocations",async()=>{
 const f=fixture();
 const result=await f.svc.reverse(ctx(),correlation,pay,{reason:"Duplicate bank credit"});
 assert.equal(result.status,"reversed");
 assert.ok(f.logs.some(l=>l.sql.includes("UPDATE payments SET status='reversed'")));
 assert.ok(f.logs.some(l=>l.sql.includes("INSERT INTO payment_status_events")));
 assert.equal(f.logs.some(l=>l.sql.startsWith("DELETE")),false);
});
test("refund is bounded by original allocation and uses audit record",async()=>{
 const f=fixture();
 const result=await f.svc.refund(ctx(),correlation,{paymentAllocationId:allocation,amount:"50.00",refundMethod:"Cash",reason:"Duplicate collection",idempotencyKey:key});
 assert.equal(result.amount,"50.00");
 assert.ok(f.logs.some(l=>l.sql.startsWith("INSERT INTO refunds")));
 const exceeded=fixture({previousRefund:"80.00"});
 await assert.rejects(exceeded.svc.refund(ctx(),correlation,{paymentAllocationId:allocation,amount:"30.00",refundMethod:"Cash",reason:"Duplicate collection",idempotencyKey:key}),FinanceConflictError);
 assert.equal(exceeded.logs.some(l=>l.sql.startsWith("INSERT INTO refunds")),false);
});
