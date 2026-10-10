import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import type {AuthorizationContext} from "../../services/authorizationService.js";
type PermissionCode=AuthorizationContext["permissions"][number]["code"];
import {AuthorizationError} from "../../services/authorizationErrors.js";
import {buildPgFoundationConfig,summarizeDatabaseUrl} from "../config.js";
import {runPendingMigrations} from "../migrations.js";
import {createPgPoolManager,type PgPoolManager} from "../pool.js";
import {assertSafeTestDatabaseTarget,getPgIntegrationReadiness} from "../testSafety.js";
import {createInvoiceDraftService} from "../../finance/invoiceDraftService.js";
import {createInvoiceLifecycleService} from "../../finance/invoiceLifecycleService.js";
import {createFinanceCollectionService} from "../../finance/financeCollectionService.js";
import {createFinanceOperationsService} from "../../finance/financeOperationsService.js";
import {createDailyFinanceService} from "../../finance/dailyFinanceService.js";

const branch="11111111-1111-4111-8111-111111111111";
const patient="22222222-2222-4222-8222-222222222222";
const clerk="33333333-3333-4333-8333-333333333333";
const second="44444444-4444-4444-8444-444444444444";
const admin="55555555-5555-4555-8555-555555555555";
const allBranch:PermissionCode[]=["finance.invoice.draft","finance.invoice.read","finance.invoice.finalize",
 "finance.invoice.void","finance.payment.record","finance.payment.read","finance.payment.reverse",
 "finance.refund.record","finance.supplier.create","finance.supplier.read",
 "finance.payable.create","finance.payable.read","finance.payable.pay",
 "finance.daily.read","finance.closing.submit"];
const global:PermissionCode[]=["finance.payable.approve","finance.expense.approve","finance.opening.record","finance.closing.approve"];
const businessDate=new Date().toISOString().slice(0,10);
const rid=()=>crypto.randomUUID();
function staff(id=clerk,branchIds=[branch]):AuthorizationContext{
 return {userId:id,authUserId:rid(),email:"fictional@example.test",displayName:"Fictional Personnel",
 status:"active",roles:["PERSONNEL"],branchIds,
 permissions:allBranch.map(code=>({code,scope:"BRANCH" as const}))};
}
function owner():AuthorizationContext{
 return {userId:admin,authUserId:rid(),email:"owner@example.test",displayName:"Fictional Owner",
 status:"active",roles:["CLINIC_ADMINISTRATOR"],branchIds:[],
 permissions:global.map(code=>({code,scope:"GLOBAL" as const}))};
}
function localPool():PgPoolManager{
 const cfg=buildPgFoundationConfig();
 if(!cfg.testDatabaseUrl)throw Error("Missing dedicated TEST_DATABASE_URL");
 assertSafeTestDatabaseTarget(cfg.testDatabaseUrl,cfg.databaseUrl,cfg.appEnv);
 const target=summarizeDatabaseUrl(cfg.testDatabaseUrl,cfg.sslMode,cfg.appEnv);
 if(target.database!=="dental_test_sandbox"||target.host!=="127.0.0.1"||target.sslMode!=="disable")
  throw Error("Refusing finance test outside explicitly approved local disposable dental_test_sandbox");
 return createPgPoolManager({...cfg,...target,databaseUrl:cfg.testDatabaseUrl});
}
async function clean(pool:PgPoolManager){
 const found=await pool.query<{tablename:string}>("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'");
 for(const {tablename} of found.rows){
  if(!/^[a-z_][a-z0-9_]*$/.test(tablename))throw Error("Unsafe test table name");
  await pool.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
 }
}
let counter=0;
async function newInvoice(pool:PgPoolManager,gross="100.00"){
 const treatment=rid(),idx=++counter,code="T-2026-"+String(idx).padStart(4,"0");
 await pool.query(`INSERT INTO treatments(id,treatment_code,patient_id,branch_id,treatment_date,procedure,dentists,
 amount_charged,discount_type,discount_percent,discount_amount,net_amount_due,amount_paid,balance,created_at,updated_at)
 VALUES($1,$2,$3,$4,$5,'Fictional dental procedure','Fictional Dentist',$6,'None',0,0,$6,0,$6,NOW(),NOW())`,
 [treatment,code,patient,branch,businessDate,gross]);
 const draft=await createInvoiceDraftService(pool).draft(staff(),rid(),{treatmentId:treatment});
 assert.equal(draft.status,"draft");
 const finalized=await createInvoiceLifecycleService(pool).finalize(staff(),rid(),draft.id,{});
 assert.equal(finalized.status,"finalized");
 assert.match(finalized.internalReference,/^INT-\d{4}-\d{6}$/);
 return draft.id;
}
async function invoiceAmount(pool:PgPoolManager,invoiceId:string){
 const r=await pool.query<{amount_paid:string;balance_due:string}>(`SELECT amount_paid::text,balance_due::text FROM invoices WHERE id=$1`,[invoiceId]);
 return r.rows[0];
}
async function allocationId(pool:PgPoolManager,paymentId:string){
 const r=await pool.query<{id:string}>(`SELECT id FROM payment_allocations WHERE payment_id=$1 LIMIT 1`,[paymentId]);
 assert.ok(r.rows[0]);return r.rows[0].id;
}
test("Phase 15 PostgreSQL integration: financial integrity, concurrency, rollback, and closing",async t=>{
 const readiness=getPgIntegrationReadiness();
 if(!readiness.ready){t.skip(readiness.reason??"Requires isolated PostgreSQL test database");return}
 const pool=localPool();
 let schemaReady=false;
 try{
  const identity=await pool.query<{db:string;table_count:number}>(`SELECT current_database() AS db,
    (SELECT COUNT(*)::int FROM pg_catalog.pg_tables WHERE schemaname='public') AS table_count`);
  assert.equal(identity.rows[0]?.db,"dental_test_sandbox");
  assert.equal(identity.rows[0]?.table_count,0,"Refusing to modify non-empty test database");
  schemaReady=true;
  const result=await runPendingMigrations(pool);
  assert.equal(result.applied.length,20);
  await pool.query("INSERT INTO branches(id,branch_code,branch_name,created_at,updated_at) VALUES($1,'FTST','Fictional Clinic Finance',NOW(),NOW())",[branch]);
  await pool.query(`INSERT INTO app_users(id,email,display_name,status,created_at,updated_at)
     VALUES($1,'one@fake.test','Fictional Personnel','active',NOW(),NOW()),
     ($2,'two@fake.test','Second Personnel','active',NOW(),NOW()),
     ($3,'owner@fake.test','Fictional Owner','active',NOW(),NOW())`,[clerk,second,admin]);
  await pool.query(`INSERT INTO patients(id,patient_code,branch_id,date_registered,last_name,first_name,birthday,gender,
    mobile_number,created_at,updated_at) VALUES($1,'P-2026-9001',$2,$3,'Fictional','Patient','2000-01-01','Other','09170000001',NOW(),NOW())`,[patient,branch,businessDate]);
  await t.test("draft and finalization persist exact invoice, item, internal reference and audit",async()=>{
   const invoice=await newInvoice(pool);
   assert.deepEqual(await invoiceAmount(pool,invoice),{amount_paid:"0.00",balance_due:"100.00"});
   const events=await pool.query<{action:string}>(`SELECT action FROM audit_events WHERE target_id=$1 ORDER BY occurred_at`,[invoice]);
   assert.ok(events.rows.some(r=>r.action==="INVOICE_DRAFTED"));
   assert.ok(events.rows.some(r=>r.action==="INTERNAL_INVOICE_FINALIZED"));
   await assert.rejects(pool.query("UPDATE invoice_items SET line_total=0 WHERE invoice_id=$1",[invoice]));
  });
  await t.test("posted allocation, refund, and reversal exclusion use real PostgreSQL constraints",async()=>{
   const invoice=await newInvoice(pool);
   const finance=createFinanceCollectionService(pool);
   const posted=await finance.record(staff(),rid(),{amount:"60.00",paymentMethod:"GCash",idempotencyKey:rid(),
    invoiceAllocations:[{invoiceId:invoice,amount:"60.00"}]});
   assert.equal(posted.status,"posted");
   assert.deepEqual(await invoiceAmount(pool,invoice),{amount_paid:"60.00",balance_due:"40.00"});
   const alloc=await allocationId(pool,posted.id);
   await assert.rejects(pool.query("UPDATE payment_allocations SET amount=1 WHERE id=$1",[alloc]));
   const refund=await finance.refund(staff(),rid(),{paymentAllocationId:alloc,amount:"20.00",
      refundMethod:"GCash",reason:"Fictional duplicate payment",idempotencyKey:rid()});
   assert.equal(refund.status,"recorded");
   assert.deepEqual(await invoiceAmount(pool,invoice),{amount_paid:"40.00",balance_due:"60.00"});
   await assert.rejects(finance.reverse(staff(),rid(),posted.id,{reason:"Payment includes recorded refund"}));
   await assert.rejects(finance.refund(staff(),rid(),{paymentAllocationId:alloc,amount:"41.00",
     refundMethod:"Cash",reason:"Over refund attempt",idempotencyKey:rid()}));
   assert.deepEqual(await invoiceAmount(pool,invoice),{amount_paid:"40.00",balance_due:"60.00"});
  });
  await t.test("simultaneous payments cannot over-allocate the same invoice",async()=>{
   const invoice=await newInvoice(pool),s=createFinanceCollectionService(pool);
   const issue=(amount:string,id:string)=>s.record(staff(id),rid(),{amount,paymentMethod:"Cash",idempotencyKey:rid(),
     invoiceAllocations:[{invoiceId:invoice,amount}]});
   const result=await Promise.allSettled([issue("70.00",clerk),issue("50.00",second)]);
   assert.equal(result.filter(r=>r.status==="fulfilled").length,1);
   const paid=await invoiceAmount(pool,invoice);
   assert.ok(["70.00","50.00"].includes(paid.amount_paid));
   const check=await pool.query<{total:string}>(`SELECT COALESCE(SUM(pa.amount),0)::text AS total
     FROM payment_allocations pa JOIN payments p ON p.id=pa.payment_id
     WHERE pa.invoice_id=$1 AND p.status='posted'`,[invoice]);
   assert.equal(check.rows[0].total,paid.amount_paid);
   await assert.rejects(pool.query("UPDATE invoices SET amount_paid=99.99 WHERE id=$1",[invoice]));
  });
  await t.test("duplicate idempotency key returns the existing payment, not new allocations",async()=>{
   const invoice=await newInvoice(pool),s=createFinanceCollectionService(pool),key=rid();
   const args={amount:"10.00",paymentMethod:"Cash",idempotencyKey:key,invoiceAllocations:[{invoiceId:invoice,amount:"10.00"}]};
   const first=await s.record(staff(),rid(),args),secondTry=await s.record(staff(),rid(),args);
   assert.equal(first.id,secondTry.id);assert.equal(secondTry.replayed,true);
   await assert.rejects(s.record(staff(),rid(),{...args,amount:"11.00",invoiceAllocations:[{invoiceId:invoice,amount:"11.00"}]}));
   assert.equal((await invoiceAmount(pool,invoice)).amount_paid,"10.00");
  });
  await t.test("reversal preserves the original payment but restores invoice balance",async()=>{
   const invoice=await newInvoice(pool),s=createFinanceCollectionService(pool);
   const posted=await s.record(staff(),rid(),{amount:"25.00",paymentMethod:"Cash",idempotencyKey:rid(),
    invoiceAllocations:[{invoiceId:invoice,amount:"25.00"}]});
   const reversed=await s.reverse(staff(),rid(),posted.id,{reason:"Duplicated fictional collection"});
   assert.equal(reversed.status,"reversed");
   assert.deepEqual(await invoiceAmount(pool,invoice),{amount_paid:"0.00",balance_due:"100.00"});
   const existing=await pool.query<{status:string}>("SELECT status FROM payments WHERE id=$1",[posted.id]);
   assert.equal(existing.rows[0].status,"reversed");
   await assert.rejects(s.reverse(staff(),rid(),posted.id,{reason:"Another reversal"}));
  });
  await t.test("supplier payable approval, payment, concurrent overpayment, immutable history",async()=>{
   const s=createFinanceOperationsService(pool);
   const supplier=await s.supplier(staff(),rid(),{branchId:branch,name:"Fictional Dental Supplier"});
   const payable=await s.payable(staff(),rid(),{branchId:branch,supplierId:supplier.id,billNumber:"TEST-2026-1",
    billDate:businessDate,amount:"100.00"});
   await assert.rejects(s.payablePayment(staff(),rid(),payable.id,{amount:"10.00",paymentMethod:"Cash",idempotencyKey:rid()}));
   const approved=await s.review(owner(),rid(),"payable",payable.id,{decision:"approved"});
   assert.equal(approved.approvalStatus,"approved");
   const pay=(amount:string,user:string)=>s.payablePayment(staff(user),rid(),payable.id,{amount,paymentMethod:"GCash",idempotencyKey:rid()});
   const concurrent=await Promise.allSettled([pay("70.00",clerk),pay("50.00",second)]);
   assert.equal(concurrent.filter(r=>r.status==="fulfilled").length,1);
   const q=await pool.query<{amount_paid:string;outstanding_amount:string}>(`SELECT amount_paid::text,outstanding_amount::text
    FROM accounts_payable WHERE id=$1`,[payable.id]);
   assert.ok(["70.00","50.00"].includes(q.rows[0].amount_paid));
   const history=await pool.query<{id:string;amount:string}>(`SELECT id,amount::text FROM payable_payments WHERE payable_id=$1`,[payable.id]);
   assert.equal(history.rows.length,1);
   assert.equal(history.rows[0].amount,q.rows[0].amount_paid);
   await assert.rejects(pool.query("DELETE FROM payable_payments WHERE id=$1",[history.rows[0].id]));
  });
  await t.test("cash closing requires opening cash and independent approval, then locks snapshots",async()=>{
   const svc=createDailyFinanceService(pool);
   await svc.opening(owner(),rid(),{branchId:branch,businessDate,openingCash:"500.00",reason:"Fictional opening cash count"});
   const day=await svc.summary(staff(),branch,businessDate);
   const expectation=50000+Math.round(Number(day.cashCollected)*100)-Math.round(Number(day.cashReversals)*100)-
     Math.round(Number(day.cashRefunds)*100)-Math.round(Number(day.cashSupplierPayments)*100);
   assert.ok(expectation>=0);
   const actual=(expectation/100).toFixed(2);
   const closing=await svc.submit(staff(),rid(),{branchId:branch,businessDate,actualCash:actual,cashMovementsAttested:true});
   assert.equal(closing.expectedCash,actual);
   await assert.rejects(svc.review(staff(),rid(),closing.id,{decision:"approved"}),AuthorizationError);
   assert.equal((await svc.review(owner(),rid(),closing.id,{decision:"approved"})).status,"approved");
   await assert.rejects(svc.review(owner(),rid(),closing.id,{decision:"approved"}));
   await assert.rejects(pool.query("UPDATE daily_closings SET actual_cash=0 WHERE id=$1",[closing.id]));
   const events=await pool.query<{action:string}>(`SELECT action FROM daily_closing_events WHERE closing_id=$1 ORDER BY occurred_at`,[closing.id]);
   assert.deepEqual(events.rows.map(x=>x.action),["submitted","approved"]);
  });
  await t.test("database rollback preserves no payment when audit insertion fails",async()=>{
   const invoice=await newInvoice(pool);
   // Test-only trigger on the dedicated disposable database.
   await pool.query(`CREATE OR REPLACE FUNCTION finance_test_fail_payment_audit() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='PAYMENT_RECORDED'
     THEN RAISE EXCEPTION 'Intentional financial audit failure'; END IF; RETURN NEW; END; $$`);
   await pool.query(`CREATE TRIGGER finance_test_reject_payment_audit BEFORE INSERT ON audit_events
     FOR EACH ROW EXECUTE FUNCTION finance_test_fail_payment_audit()`);
   try{
    await assert.rejects(createFinanceCollectionService(pool).record(staff(),rid(),{amount:"15.00",
     paymentMethod:"Cash",idempotencyKey:rid(),invoiceAllocations:[{invoiceId:invoice,amount:"15.00"}]}));
    const count=await pool.query<{total:number}>(`SELECT COUNT(*)::int AS total FROM payment_allocations WHERE invoice_id=$1`,[invoice]);
    assert.equal(count.rows[0].total,0);
    assert.deepEqual(await invoiceAmount(pool,invoice),{amount_paid:"0.00",balance_due:"100.00"});
   }finally{
    await pool.query("DROP TRIGGER IF EXISTS finance_test_reject_payment_audit ON audit_events");
    await pool.query("DROP FUNCTION IF EXISTS finance_test_fail_payment_audit()");
   }
  });
 }finally{
  try{if(schemaReady)await clean(pool)}finally{await pool.shutdown()}
 }
});
