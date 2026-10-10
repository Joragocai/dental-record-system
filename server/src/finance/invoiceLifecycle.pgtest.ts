import assert from "node:assert/strict";
import test from "node:test";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {QueryResult,QueryResultRow} from "pg";
import type {AuthorizationContext} from "../services/authorizationService.js";
import {AuthorizationError} from "../services/authorizationErrors.js";
import {createInvoiceLifecycleService,FinanceConflictError} from "./invoiceLifecycleService.js";
const id="11111111-1111-4111-8111-111111111111";
const user="22222222-2222-4222-8222-222222222222";
const auth="33333333-3333-4333-8333-333333333333";
const branch="44444444-4444-4444-8444-444444444444";
const request="55555555-5555-4555-8555-555555555555";
function context(role:"PERSONNEL"|"SYSTEM_ADMINISTRATOR"="PERSONNEL",branches=[branch]):AuthorizationContext {
 return {userId:user,authUserId:auth,email:"staff@example.test",displayName:"Staff",status:"active",
 roles:[role],branchIds:branches,permissions:[{code:"finance.invoice.finalize",scope:"BRANCH"},{code:"finance.invoice.void",scope:"BRANCH"}]};
}
function fake(status="draft",valid=true){
 const calls:string[]=[];let updates=0;
 const db:PgQueryExecutor={async query<R extends QueryResultRow>(sql:string):Promise<QueryResult<R>>{
  calls.push(sql);let rows:Record<string,unknown>[]=[];
  if(sql.includes("FROM invoices WHERE id=$1 FOR UPDATE"))rows=[{id,branch_id:branch,status,internal_reference:status==="draft"?null:"INT-2026-000001",subtotal:"100.00",discount_total:"20.00",total_amount:valid?"80.00":"81.00",amount_paid:"0.00",balance_due:"80.00",invoice_date:"2026-10-10"}];
  else if(sql.includes("FROM invoice_items WHERE invoice_id=$1"))rows=[{unit_price:"100.00",discount_amount:"20.00",line_total:"80.00"}];
  else if(sql.includes("RETURNING last_sequence"))rows=[{last_sequence:1}];
  if(sql.startsWith("UPDATE invoices"))updates++;
  return {rows:rows as R[],rowCount:sql.startsWith("UPDATE")||sql.startsWith("INSERT")?1:rows.length,command:"",fields:[],oid:0};
 }};
 const pool:PgPoolManager={query:db.query,withTransaction:async fn=>fn(db),describeTarget:()=>({appEnv:"test",host:"localhost",port:5432,database:"fake_test",username:"test",sslMode:"disable"}),isStarted:()=>true,shutdown:async()=>{}};
 return {service:createInvoiceLifecycleService(pool),calls,get updates(){return updates}};
}
test("internal finalization allocates reference once with status history and audit",async()=>{
 const h=fake();
 const r=await h.service.finalize(context(),request,id,{});
 assert.deepEqual(r,{id,status:"finalized",internalReference:"INT-2026-000001",totalAmount:"80.00"});
 assert.equal(h.updates,1);
 assert.ok(h.calls.some(x=>x.includes("INSERT INTO invoice_status_events")));
 assert.ok(h.calls.some(x=>x.includes("INSERT INTO audit_events")));
});
test("void retains internal reference and requires reason",async()=>{
 const h=fake("finalized");
 await assert.rejects(h.service.void(context(),request,id,{reason:"bad"}));
 assert.equal(h.updates,0);
 assert.equal((await h.service.void(context(),request,id,{reason:"Correction requested"})).status,"void");
});
test("wrong branch, technical-only role and inconsistent item totals deny transition",async()=>{
 for(const actor of [context("SYSTEM_ADMINISTRATOR"),context("PERSONNEL",[])]){
  const h=fake();
  await assert.rejects(h.service.finalize(actor,request,id,{}),AuthorizationError);
  assert.equal(h.updates,0);
 }
 const inconsistent=fake("draft",false);
 await assert.rejects(inconsistent.service.finalize(context(),request,id,{}),FinanceConflictError);
 assert.equal(inconsistent.updates,0);
});
test("cannot finalize already finalized invoice or void draft",async()=>{
 await assert.rejects(fake("finalized").service.finalize(context(),request,id,{}),FinanceConflictError);
 await assert.rejects(fake("draft").service.void(context(),request,id,{reason:"Wrong billing"}),FinanceConflictError);
});
