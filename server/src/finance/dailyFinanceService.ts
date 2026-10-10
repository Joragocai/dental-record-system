import crypto from "node:crypto";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {AuthorizationContext} from "../services/authorizationService.js";
import {AuthorizationError} from "../services/authorizationErrors.js";
import {FinanceInputError,cents,peso} from "./invoiceMoney.js";
import {FinanceConflictError} from "./invoiceLifecycleService.js";
import {createAuditEventRepository} from "../repositories/auditEventRepository.js";
import {defaultClinicTimezone} from "../postgres/batchA/patientCodeAllocation.js";
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId=(v:unknown)=>{if(typeof v!=="string"||!uid.test(v))throw new FinanceInputError();return v};
const day=(v:unknown)=>{if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))throw new FinanceInputError();const t=new Date(v+"T00:00:00Z");if(Number.isNaN(t.getTime())||t.toISOString().slice(0,10)!==v)throw new FinanceInputError();return v};
function obj(v:unknown,keys:string[]){if(!v||typeof v!=="object"||Array.isArray(v))throw new FinanceInputError();const o=v as Record<string,unknown>;if(Object.keys(o).some(k=>!keys.includes(k)))throw new FinanceInputError();return o}
function auth(c:AuthorizationContext,code:string,branch:string|null){if(c.status!=="active"||!c.permissions.some(p=>p.code===code&&p.scope===(branch===null?"GLOBAL":"BRANCH"))||(branch===null?!c.roles.includes("CLINIC_ADMINISTRATOR"):(!c.branchIds.includes(branch)||!c.roles.some(r=>r==="PERSONNEL"||r==="DENTIST"))))throw new AuthorizationError("AUTHORIZATION_DENIED")}
async function audit(db:PgQueryExecutor,c:AuthorizationContext,rid:string,target:string,branch:string,action:string){await createAuditEventRepository(db).insert({id:crypto.randomUUID(),actorUserId:c.userId,actorAuthUserId:c.authUserId,requestId:rid,action,targetType:"DAILY_CLOSING",targetId:target,branchId:branch,outcome:"SUCCESS",metadata:{internalOnly:true},occurredAt:new Date().toISOString()})}
const totalsQuery=`SELECT
 (SELECT COALESCE(SUM(total_amount),0)::text FROM invoices WHERE branch_id=$1 AND invoice_date=$2 AND status='finalized') AS billed,
 (SELECT COALESCE(SUM(balance_due),0)::text FROM invoices WHERE branch_id=$1 AND status='finalized') AS receivables,
 (SELECT COALESCE(SUM(original_amount),0)::text FROM accounts_payable WHERE branch_id=$1 AND bill_date=$2 AND approval_status='approved') AS new_payables,
 (SELECT COALESCE(SUM(outstanding_amount),0)::text FROM accounts_payable WHERE branch_id=$1 AND approval_status='approved') AS payables,
 (SELECT COALESCE(SUM(amount),0)::text FROM payments WHERE branch_id=$1 AND (payment_date AT TIME ZONE $3::text)::date=$2 AND payment_method='Cash' AND status IN ('posted','reversed')) AS cash_receipts,
 (SELECT COALESCE(SUM(amount),0)::text FROM payments WHERE branch_id=$1 AND (reversed_at AT TIME ZONE $3::text)::date=$2 AND status='reversed' AND payment_method='Cash') AS cash_reversals,
 (SELECT COALESCE(SUM(amount),0)::text FROM payments WHERE branch_id=$1 AND (payment_date AT TIME ZONE $3::text)::date=$2 AND payment_method<>'Cash' AND status IN ('posted','reversed')) AS digital_collections,
 (SELECT COALESCE(SUM(amount),0)::text FROM payments WHERE branch_id=$1 AND (reversed_at AT TIME ZONE $3::text)::date=$2 AND status='reversed' AND payment_method<>'Cash') AS digital_reversals,
 (SELECT COALESCE(SUM(r.amount),0)::text FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.branch_id=$1 AND (r.recorded_at AT TIME ZONE $3::text)::date=$2 AND r.refund_method='Cash') AS cash_refunds,
 (SELECT COALESCE(SUM(r.amount),0)::text FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.branch_id=$1 AND (r.recorded_at AT TIME ZONE $3::text)::date=$2 AND r.refund_method<>'Cash') AS digital_refunds,
 (SELECT COALESCE(SUM(pp.amount),0)::text FROM payable_payments pp WHERE pp.branch_id=$1 AND (pp.recorded_at AT TIME ZONE $3::text)::date=$2 AND pp.payment_method='Cash') AS cash_supplier_payments,
 (SELECT COALESCE(SUM(pp.amount),0)::text FROM payable_payments pp WHERE pp.branch_id=$1 AND (pp.recorded_at AT TIME ZONE $3::text)::date=$2 AND pp.payment_method<>'Cash') AS digital_supplier_payments`;
type Totals=Record<"billed"|"receivables"|"new_payables"|"payables"|"cash_receipts"|"cash_reversals"|"digital_collections"|"digital_reversals"|"cash_refunds"|"digital_refunds"|"cash_supplier_payments"|"digital_supplier_payments",string>;
export function createDailyFinanceService(pool:PgPoolManager,timeZone=process.env.CLINIC_TIMEZONE || defaultClinicTimezone){
 // A historical receipt remains on its original date even when reversed later;
 // its offsetting reversal belongs only to the reversal date, not the original date.
 try{new Intl.DateTimeFormat("en-US",{timeZone});}catch{throw new Error("Invalid clinic financial reporting time zone.");}
 async function summary(db:PgQueryExecutor,branch:string,businessDate:string){
  const result=await db.query<Totals>(totalsQuery,[branch,businessDate,timeZone]);
  const row=result.rows[0];if(!row)throw new FinanceConflictError();
  const val=(key:keyof Totals)=>cents(row[key]);
  return {businessDate,branchId:branch,businessTimeZone:timeZone,servicesBilled:peso(val("billed")),outstandingReceivables:peso(val("receivables")),
   newPayables:peso(val("new_payables")),outstandingPayables:peso(val("payables")),
   cashCollected:peso(val("cash_receipts")),digitalCollected:peso(val("digital_collections")),
   cashReversals:peso(val("cash_reversals")),digitalReversals:peso(val("digital_reversals")),cashRefunds:peso(val("cash_refunds")),
   digitalRefunds:peso(val("digital_refunds")),cashSupplierPayments:peso(val("cash_supplier_payments")),
   digitalSupplierPayments:peso(val("digital_supplier_payments")),
   expensesPaid:null,expensesPaidStatus:"not_integrated" as const,
   netCashMovement:null,netCashMovementStatus:"not_integrated" as const,internalOnly:true};
 }
 return {
  async summary(c:AuthorizationContext,branchRaw:unknown,dateRaw:unknown,rid?:string){
   const branch=validId(branchRaw),d=day(dateRaw);auth(c,"finance.daily.read",branch);
   return pool.withTransaction(async db=>{
    const result=await summary(db,branch,d);
    if(rid)await audit(db,c,rid,crypto.randomUUID(),branch,"FINANCE_DAILY_SUMMARY_VIEWED");
    return result;
   });
  },
  async export(c:AuthorizationContext,rid:string,branchRaw:unknown,dateRaw:unknown){
   const branch=validId(branchRaw),d=day(dateRaw);auth(c,"finance.report.export",branch);
   return pool.withTransaction(async db=>{
    const snapshot=await summary(db,branch,d);
    const fields:[string,string][]=[
     ["Services Billed",snapshot.servicesBilled],
     ["Outstanding Receivables",snapshot.outstandingReceivables],
     ["New Approved Payables",snapshot.newPayables],
     ["Outstanding Payables",snapshot.outstandingPayables],
     ["Cash Receipts",snapshot.cashCollected],["Digital Collections",snapshot.digitalCollected],
     ["Cash Payment Reversals",snapshot.cashReversals],["Digital Payment Reversals",snapshot.digitalReversals],["Cash Refunds",snapshot.cashRefunds],
     ["Digital Refunds",snapshot.digitalRefunds],["Cash Supplier Payments",snapshot.cashSupplierPayments],
     ["Digital Supplier Payments",snapshot.digitalSupplierPayments]
    ];
    const csv=["Metric,PHP",...fields.map(([k,v])=>k+","+v)].join("\r\n")+"\r\n";
    await audit(db,c,rid,crypto.randomUUID(),branch,"FINANCE_DAILY_REPORT_EXPORTED");
    return {csv,filename:"internal-finance-"+d+".csv",complete:false,
      warning:"Direct expense payments and unintegrated historical records are excluded."};
   });
  },
  async opening(c:AuthorizationContext,rid:string,input:unknown){
   const o=obj(input,["branchId","businessDate","openingCash","reason"]);
   const branch=validId(o.branchId),d=day(o.businessDate),opening=peso(cents(o.openingCash));
   if(typeof o.reason!=="string"||o.reason.trim().length<5||o.reason.trim().length>500)throw new FinanceInputError();
   auth(c,"finance.opening.record",null);
   return pool.withTransaction(async db=>{
    const id=crypto.randomUUID();
    await db.query("INSERT INTO cash_opening_balances(id,branch_id,business_date,opening_cash,reason,authorized_by) VALUES($1,$2,$3,$4,$5,$6)",[id,branch,d,opening,(o.reason as string).trim(),c.userId]);
    await audit(db,c,rid,id,branch,"OPENING_CASH_AUTHORIZED");
    return {id,branchId:branch,businessDate:d,openingCash:opening};
   });
  },
  async submit(c:AuthorizationContext,rid:string,input:unknown){
   const o=obj(input,["branchId","businessDate","actualCash","cashMovementsAttested","discrepancyReason"]);
   const branch=validId(o.branchId),d=day(o.businessDate),actual=cents(o.actualCash);
   if(o.cashMovementsAttested!==true)throw new FinanceInputError();
   const reason=o.discrepancyReason==null?null:o.discrepancyReason;
   auth(c,"finance.closing.submit",branch);
   return pool.withTransaction(async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[branch,d]);
    const opening=await db.query<{opening_cash:string}>("SELECT opening_cash::text FROM cash_opening_balances WHERE branch_id=$1 AND business_date=$2",[branch,d]);
    if(!opening.rows[0])throw new FinanceConflictError();
    const snapshot=await summary(db,branch,d);
    const expected=cents(opening.rows[0].opening_cash)+cents(snapshot.cashCollected)-cents(snapshot.cashReversals)-cents(snapshot.cashRefunds)-cents(snapshot.cashSupplierPayments);
    if(expected<0)throw new FinanceConflictError();
    const diff=actual-expected;
    if(diff!==0&&(typeof reason!=="string"||reason.trim().length<5||reason.trim().length>500))throw new FinanceInputError();
    if(diff===0&&reason!=null)throw new FinanceInputError();
    const closingId=crypto.randomUUID();
    await db.query(`INSERT INTO daily_closings(id,branch_id,business_date,opening_cash,cash_receipts,cash_reversals,cash_refunds,
     cash_supplier_payments,expected_cash,actual_cash,cash_difference,cash_movements_attested,discrepancy_reason,submitted_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12,$13)`,
     [closingId,branch,d,opening.rows[0].opening_cash,snapshot.cashCollected,snapshot.cashReversals,snapshot.cashRefunds,
      snapshot.cashSupplierPayments,peso(expected),peso(actual),diff<0?"-"+peso(-diff):peso(diff),diff===0?null:(reason as string).trim(),c.userId]);
    await db.query("INSERT INTO daily_closing_events(id,closing_id,action,actor_user_id,request_id) VALUES($1,$2,'submitted',$3,$4)",[crypto.randomUUID(),closingId,c.userId,rid]);
    await audit(db,c,rid,closingId,branch,"DAILY_CLOSING_SUBMITTED");
    return {id:closingId,status:"submitted",expectedCash:peso(expected),actualCash:peso(actual),difference:diff<0?"-"+peso(-diff):peso(diff)};
   });
  },
  async review(c:AuthorizationContext,rid:string,rawId:unknown,input:unknown){
   const closingId=validId(rawId),o=obj(input,["decision","reason"]);
   const decision=o.decision;if(decision!=="approved"&&decision!=="rejected")throw new FinanceInputError();
   const reason=decision==="rejected"?o.reason:null;
   if(decision==="rejected"&&(typeof reason!=="string"||reason.trim().length<5||reason.trim().length>500))throw new FinanceInputError();
   if(decision==="approved"&&o.reason!=null)throw new FinanceInputError();
   auth(c,"finance.closing.approve",null);
   return pool.withTransaction(async db=>{
    const q=await db.query<{id:string;branch_id:string;status:string;submitted_by:string}>("SELECT id,branch_id,status,submitted_by FROM daily_closings WHERE id=$1 FOR UPDATE",[closingId]);
    const item=q.rows[0];if(!item)throw new AuthorizationError("AUTHORIZATION_DENIED");
    if(item.status!=="submitted"||item.submitted_by===c.userId)throw new FinanceConflictError();
    const result=await db.query("UPDATE daily_closings SET status=$2,reviewed_by=$3,reviewed_at=NOW(),review_reason=$4 WHERE id=$1 AND status='submitted'",[closingId,decision,c.userId,reason]);
    if(result.rowCount!==1)throw new FinanceConflictError();
    await db.query("INSERT INTO daily_closing_events(id,closing_id,action,actor_user_id,request_id) VALUES($1,$2,$3,$4,$5)",[crypto.randomUUID(),closingId,decision,c.userId,rid]);
    await audit(db,c,rid,closingId,item.branch_id,"DAILY_CLOSING_REVIEWED");
    return {id:closingId,status:decision};
   });
  },
  async read(c:AuthorizationContext,rawId:unknown,rid?:string){
   const closingId=validId(rawId);
   return pool.withTransaction(async db=>{
    const q=await db.query<{id:string;branch_id:string;business_date:string;status:string;expected_cash:string;actual_cash:string;cash_difference:string}>("SELECT id,branch_id,business_date,status,expected_cash::text,actual_cash::text,cash_difference::text FROM daily_closings WHERE id=$1",[closingId]);
    const item=q.rows[0];if(!item)throw new AuthorizationError("AUTHORIZATION_DENIED");
    auth(c,"finance.daily.read",item.branch_id);
    if(rid)await audit(db,c,rid,closingId,item.branch_id,"DAILY_CLOSING_VIEWED");
    return {id:item.id,businessDate:item.business_date,status:item.status,expectedCash:item.expected_cash,actualCash:item.actual_cash,cashDifference:item.cash_difference};
   });
  }
 };
}
