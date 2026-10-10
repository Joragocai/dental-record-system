import assert from "node:assert/strict";
import test from "node:test";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {QueryResult,QueryResultRow} from "pg";
import type {AuthorizationContext} from "../services/authorizationService.js";
import {AuthorizationError} from "../services/authorizationErrors.js";
import {FinanceConflictError} from "./invoiceLifecycleService.js";
import {createDailyFinanceService} from "./dailyFinanceService.js";
const USER="11111111-1111-4111-8111-111111111111",AUTH="22222222-2222-4222-8222-222222222222",
 BRANCH="33333333-3333-4333-8333-333333333333",CLOSE="44444444-4444-4444-8444-444444444444",
 CORRELATION="55555555-5555-4555-8555-555555555555";
function actor(role:"PERSONNEL"|"CLINIC_ADMINISTRATOR"|"SYSTEM_ADMINISTRATOR"="PERSONNEL",id=USER):AuthorizationContext{
 return {userId:id,authUserId:AUTH,email:"fiction@example.test",displayName:"Fiction",status:"active",roles:[role],
 branchIds:[BRANCH],permissions:["finance.daily.read","finance.closing.submit","finance.closing.approve","finance.opening.record"].map(code=>({code:code as "finance.daily.read",scope:code.includes("approve")||code.includes("opening")?"GLOBAL":"BRANCH"}))};
}
function fake(config:{opening?:boolean;submittedBy?:string;diff?:string; cash?:string}={}){
 const statements:string[]=[];const db:PgQueryExecutor={async query<R extends QueryResultRow>(sql:string):Promise<QueryResult<R>>{
 statements.push(sql);let rows:Record<string,unknown>[]=[];
 if(sql.includes("AS billed"))rows=[{billed:"100.00",receivables:"40.00",new_payables:"20.00",payables:"10.00",
 cash_receipts:config.cash??"30.00",cash_reversals:"0.00",cash_refunds:"5.00",cash_supplier_payments:"10.00",
 digital_collections:"20.00",digital_reversals:"0.00",digital_refunds:"0.00",digital_supplier_payments:"0.00"}];
 if(sql.startsWith("SELECT opening_cash"))rows=config.opening===false?[]:[{opening_cash:"100.00"}];
 if(sql.startsWith("SELECT id,branch_id,status,submitted_by"))rows=[{id:CLOSE,branch_id:BRANCH,status:"submitted",submitted_by:config.submittedBy??USER}];
 return {rows:rows as R[],rowCount:sql.startsWith("INSERT")||sql.startsWith("UPDATE")?1:rows.length,fields:[],command:"",oid:0};
 }};
 const pool:PgPoolManager={query:db.query,withTransaction:async fn=>fn(db),describeTarget:()=>({appEnv:"test",host:"localhost",port:5432,database:"finance_test",username:"test",sslMode:"disable"}),isStarted:()=>true,shutdown:async()=>{}};
 return {svc:createDailyFinanceService(pool),statements};
}
test("summary separates billing, cash, digital payments and unknown direct expense settlement",async()=>{
 const f=fake();const x=await f.svc.summary(actor(),BRANCH,"2026-10-10");
 assert.equal(x.servicesBilled,"100.00");assert.equal(x.cashCollected,"30.00");
 assert.equal(x.digitalCollected,"20.00");assert.equal(x.expensesPaid,null);
 assert.equal(x.expensesPaidStatus,"not_integrated");
});
test("report SQL accounts for Manila-day receipt, cash and digital reversal events separately",async()=>{
 const f=fake();await f.svc.summary(actor(),BRANCH,"2026-10-10");
 const sql=f.statements.find(s=>s.includes("AS billed"))??"";
 assert.match(sql,/payment_date AT TIME ZONE \$3::text/);
 assert.match(sql,/reversed_at AT TIME ZONE \$3::text/);
 assert.match(sql,/AS digital_reversals/);
 assert.match(sql,/status IN \(\x27posted\x27,\x27reversed\x27\)/);
 const f2=fake();const x=await f2.svc.export({...actor(),permissions:[...actor().permissions,{code:"finance.report.export",scope:"BRANCH"}]},CORRELATION,BRANCH,"2026-10-10");
 assert.ok(x.csv.startsWith("Metric,PHP\r\n"));
 assert.ok(x.csv.includes("\r\nDigital Payment Reversals,"));
 assert.ok(!x.csv.includes("\\n"));
});
test("closing computes opening plus cash receipts minus refunds and disbursements",async()=>{
 const f=fake();const x=await f.svc.submit(actor(),CORRELATION,{branchId:BRANCH,businessDate:"2026-10-10",actualCash:"115.00",cashMovementsAttested:true});
 assert.equal(x.expectedCash,"115.00");assert.equal(x.difference,"0.00");
 assert.ok(f.statements.some(q=>q.includes("INSERT INTO daily_closing_events")));
 assert.ok(f.statements.some(q=>q.includes("INSERT INTO audit_events")));
});
test("missing verified opening, missing attestations, and unexplained differences fail closed",async()=>{
 const f=fake({opening:false});
 await assert.rejects(f.svc.submit(actor(),CORRELATION,{branchId:BRANCH,businessDate:"2026-10-10",actualCash:"115.00",cashMovementsAttested:true}),FinanceConflictError);
 const h=fake();
 await assert.rejects(h.svc.submit(actor(),CORRELATION,{branchId:BRANCH,businessDate:"2026-10-10",actualCash:"114.00",cashMovementsAttested:true}));
 await assert.rejects(h.svc.submit(actor(),CORRELATION,{branchId:BRANCH,businessDate:"2026-10-10",actualCash:"115.00",cashMovementsAttested:false}));
});
test("Clinic Administrator cannot approve own submitted closing or make unauthenticated branch reports",async()=>{
 const same=fake();await assert.rejects(same.svc.review(actor("CLINIC_ADMINISTRATOR"),CORRELATION,CLOSE,{decision:"approved"}),FinanceConflictError);
 const other=fake();await assert.rejects(other.svc.summary(actor("SYSTEM_ADMINISTRATOR"),BRANCH,"2026-10-10"),AuthorizationError);
 const reviewer=fake({submittedBy:"66666666-6666-4666-8666-666666666666"});
 assert.equal((await reviewer.svc.review(actor("CLINIC_ADMINISTRATOR"),CORRELATION,CLOSE,{decision:"approved"})).status,"approved");
});
