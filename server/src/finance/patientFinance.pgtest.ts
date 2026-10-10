import assert from "node:assert/strict";
import test from "node:test";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {QueryResult,QueryResultRow} from "pg";
import type {AuthorizationContext} from "../services/authorizationService.js";
import {createPatientFinanceService} from "./patientFinanceService.js";
import {AuthorizationError} from "../services/authorizationErrors.js";
const user="11111111-1111-4111-8111-111111111111",auth="22222222-2222-4222-8222-222222222222",
patient="33333333-3333-4333-8333-333333333333",rid="44444444-4444-4444-8444-444444444444";
function actor(role:"PATIENT"|"PERSONNEL"="PATIENT"):AuthorizationContext{
 return {userId:user,authUserId:auth,email:"fictitious@example.test",displayName:"Fictional",
 status:"active",roles:[role],branchIds:[],permissions:[
  {code:"portal.balance.read",scope:"OWN"},{code:"portal.payments.read",scope:"OWN"}]};
}
function testPool(){
 const queries:{sql:string;args?:readonly unknown[]}[]=[];
 const db:PgQueryExecutor={async query<R extends QueryResultRow>(sql:string,args?:readonly unknown[]):Promise<QueryResult<R>>{
  queries.push({sql,args});let rows:Record<string,unknown>[]=[];
  if(sql.startsWith("SELECT app_user_id"))rows=[{app_user_id:user,patient_id:patient,status:"active"}];
  if(sql.includes("SUM(total_amount)"))rows=[{invoiced:"200.00",outstanding:"125.00"}];
  if(sql.includes("FROM payments WHERE patient_id=$1"))rows=[{id:"55555555-5555-4555-8555-555555555555",payment_date:"2026-10-10",amount:"75.00",payment_method:"GCash",status:"posted"}];
  return {rows:rows as R[],rowCount:sql.includes("INSERT INTO")?1:rows.length,fields:[],oid:0,command:"SELECT"};
 }};
 const pool:PgPoolManager={query:db.query,withTransaction:async fn=>fn(db),
 describeTarget:()=>({appEnv:"test",host:"localhost",port:5432,database:"fictional_test",username:"test",sslMode:"disable"}),
 isStarted:()=>true,shutdown:async()=>{}};
 return {service:createPatientFinanceService(pool),queries};
}
test("patient balances and payments are OWN-scoped and audited without medical or financial identifiers",async()=>{
 const x=testPool();const balance=await x.service.balance(actor(),rid),payments=await x.service.payments(actor(),rid);
 assert.equal(balance.outstanding,"125.00");assert.equal(payments.length,1);
 assert.equal(payments[0]?.officialReceiptNumber,null);
 assert.ok(x.queries.some(q=>q.sql.includes("FROM invoices")&&q.sql.includes("patient_id=$1")&&q.args?.[0]===patient));
 assert.ok(x.queries.some(q=>q.sql.includes("FROM payments")&&q.sql.includes("patient_id=$1")&&q.args?.[0]===patient));
 assert.equal(x.queries.filter(q=>q.sql.includes("INSERT INTO audit_events")).length,2);
});
test("staff identity cannot reuse patient portal OWN finance projections",async()=>{
 const x=testPool();await assert.rejects(x.service.balance(actor("PERSONNEL"),rid),AuthorizationError);
 assert.equal(x.queries.length,0);
});
