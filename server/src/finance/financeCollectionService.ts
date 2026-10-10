import crypto from "node:crypto";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {AuthorizationContext} from "../services/authorizationService.js";
import {AuthorizationError} from "../services/authorizationErrors.js";
import {cents,peso,FinanceInputError} from "./invoiceMoney.js";
import {FinanceConflictError} from "./invoiceLifecycleService.js";
import {createAuditEventRepository} from "../repositories/auditEventRepository.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const methods=["Cash","GCash","Bank Transfer","Credit Card","Debit Card","Cheque","Other"] as const;
type Method=(typeof methods)[number];
type RolePermission="finance.payment.record"|"finance.payment.read"|"finance.payment.reverse"|"finance.refund.record";
function validUuid(v:unknown){if(typeof v!=="string"||!uuid.test(v))throw new FinanceInputError();return v.toLowerCase()}
function object(v:unknown,allowed:string[]){
 if(!v||typeof v!=="object"||Array.isArray(v))throw new FinanceInputError();
 const o=v as Record<string,unknown>;if(Object.keys(o).some(k=>!allowed.includes(k)))throw new FinanceInputError();return o;
}
function description(v:unknown,max:number,min=0){
 if(v===null||v===undefined)return null;
 if(typeof v!=="string"||v.trim().length<min||v.trim().length>max)throw new FinanceInputError();
 return v.trim();
}
function method(v:unknown):Method{if(typeof v!=="string"||!methods.includes(v as Method))throw new FinanceInputError();return v as Method}
function positive(v:unknown){const n=cents(v);if(n<=0)throw new FinanceInputError();return n}
function fingerprint(fields:unknown[]){return crypto.createHash("sha256").update(JSON.stringify(fields)).digest("hex")}
function authorized(ctx:AuthorizationContext,permission:RolePermission,branch:string){
 if(ctx.status!=="active"||!ctx.branchIds.includes(branch)||!ctx.roles.some(r=>r==="PERSONNEL"||r==="DENTIST")||
 !ctx.permissions.some(p=>p.code===permission&&p.scope==="BRANCH"))throw new AuthorizationError("AUTHORIZATION_DENIED");
}
async function audit(db:PgQueryExecutor,ctx:AuthorizationContext,rid:string,action:string,target:string,branch:string){
 await createAuditEventRepository(db).insert({id:crypto.randomUUID(),actorUserId:ctx.userId,actorAuthUserId:ctx.authUserId,
 action,targetType:action.includes("REFUND")?"REFUND":"PAYMENT",targetId:target,branchId:branch,outcome:"SUCCESS",
 metadata:{internalOnly:true,officialReceiptIssued:false},occurredAt:new Date().toISOString(),requestId:rid});
}
interface InvoiceRow{id:string;patient_id:string;branch_id:string;status:string;total_amount:string;amount_paid:string;balance_due:string}
interface PaymentRow{id:string;patient_id:string;branch_id:string;status:string;amount:string;request_fingerprint:string}
async function invoiceRows(db:PgQueryExecutor,ids:string[]):Promise<InvoiceRow[]>{
 const result=await db.query<InvoiceRow>("SELECT id,patient_id,branch_id,status,total_amount,amount_paid,balance_due FROM invoices WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[ids]);
 return result.rows;
}
async function refreshBalances(db:PgQueryExecutor,rows:InvoiceRow[]){
 for(const inv of rows){
  const allocated=await db.query<{amount:string}>(`SELECT COALESCE(SUM(pa.amount),0)::text AS amount FROM payment_allocations pa
  JOIN payments p ON p.id=pa.payment_id WHERE pa.invoice_id=$1 AND p.status='posted'`,[inv.id]);
  const refunded=await db.query<{amount:string}>(`SELECT COALESCE(SUM(r.amount),0)::text AS amount FROM refunds r
   JOIN payments p ON p.id=r.payment_id WHERE r.invoice_id=$1 AND p.status='posted'`,[inv.id]);
  const settled=cents(allocated.rows[0]?.amount??"0")-cents(refunded.rows[0]?.amount??"0");
  const total=cents(inv.total_amount);
  if(settled<0||settled>total)throw new FinanceConflictError();
  const updated=await db.query("UPDATE invoices SET amount_paid=$2,balance_due=$3,updated_at=NOW() WHERE id=$1 AND status='finalized'",
   [inv.id,peso(settled),peso(total-settled)]);
  if(updated.rowCount!==1)throw new FinanceConflictError();
 }
}
export function createFinanceCollectionService(pool:PgPoolManager){
 return {
  async record(ctx:AuthorizationContext,rid:string,input:unknown){
   const o=object(input,["invoiceAllocations","amount","paymentMethod","referenceNumber","notes","idempotencyKey"]);
   const key=validUuid(o.idempotencyKey),total=positive(o.amount),payMethod=method(o.paymentMethod);
   const ref=description(o.referenceNumber,120),notes=description(o.notes,500);
   if(!Array.isArray(o.invoiceAllocations)||o.invoiceAllocations.length<1||o.invoiceAllocations.length>20)throw new FinanceInputError();
   const allocations=o.invoiceAllocations.map(v=>{const item=object(v,["invoiceId","amount"]);return {invoiceId:validUuid(item.invoiceId),amount:positive(item.amount)}});
   const ids=allocations.map(x=>x.invoiceId);
   if(new Set(ids).size!==ids.length||allocations.reduce((n,a)=>n+a.amount,0)!==total)throw new FinanceInputError();
   allocations.sort((a,b)=>a.invoiceId.localeCompare(b.invoiceId));
   const hash=fingerprint([allocations,total,payMethod,ref,notes]);
   return pool.withTransaction(async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[ctx.userId,key]);
    const prior=await db.query<PaymentRow>("SELECT id,patient_id,branch_id,status,amount,request_fingerprint FROM payments WHERE received_by=$1 AND idempotency_key=$2",[ctx.userId,key]);
    if(prior.rows[0]){
     const p=prior.rows[0];authorized(ctx,"finance.payment.record",p.branch_id);
     if(p.request_fingerprint!==hash)throw new FinanceConflictError();
     return {id:p.id,status:p.status,replayed:true};
    }
    const rows=await invoiceRows(db,allocations.map(a=>a.invoiceId));
    if(rows.length!==allocations.length)throw new AuthorizationError("AUTHORIZATION_DENIED");
    const branch=rows[0].branch_id,patient=rows[0].patient_id;
    authorized(ctx,"finance.payment.record",branch);
    for(const inv of rows){
     if(inv.status!=="finalized"||inv.branch_id!==branch||inv.patient_id!==patient||
        (allocations.find(a=>a.invoiceId===inv.id)?.amount??0)>cents(inv.balance_due))
       throw new FinanceConflictError();
    }
    const id=crypto.randomUUID();
    await db.query(`INSERT INTO payments(id,patient_id,branch_id,amount,payment_method,reference_number,
     notes,received_by,status,idempotency_key,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'posted',$9,$10)`,
     [id,patient,branch,peso(total),payMethod,ref,notes,ctx.userId,key,hash]);
    for(const allocation of allocations){
     await db.query("INSERT INTO payment_allocations(id,payment_id,invoice_id,patient_id,branch_id,amount) VALUES($1,$2,$3,$4,$5,$6)",
       [crypto.randomUUID(),id,allocation.invoiceId,patient,branch,peso(allocation.amount)]);
    }
    await refreshBalances(db,rows);
    await audit(db,ctx,rid,"PAYMENT_RECORDED",id,branch);
    return {id,status:"posted",amount:peso(total),receiptNumber:null,replayed:false};
   });
  },
  async reverse(ctx:AuthorizationContext,rid:string,rawId:unknown,input:unknown){
   const id=validUuid(rawId),o=object(input,["reason"]);const reason=description(o.reason,500,5);
   if(!reason)throw new FinanceInputError();
   return pool.withTransaction(async db=>{
    const p=await db.query<PaymentRow>("SELECT id,patient_id,branch_id,status,amount,request_fingerprint FROM payments WHERE id=$1",[id]);
    if(!p.rows[0])throw new AuthorizationError("AUTHORIZATION_DENIED");
    const pay=p.rows[0];authorized(ctx,"finance.payment.reverse",pay.branch_id);
    const allocations=await db.query<{invoice_id:string}>("SELECT invoice_id FROM payment_allocations WHERE payment_id=$1 ORDER BY invoice_id",[id]);
    const rows=await invoiceRows(db,allocations.rows.map(a=>a.invoice_id));
    const locked=await db.query<PaymentRow>("SELECT id,patient_id,branch_id,status,amount,request_fingerprint FROM payments WHERE id=$1 FOR UPDATE",[id]);
    if(locked.rows[0]?.status!=="posted"||rows.length!==allocations.rows.length)throw new FinanceConflictError();
    const refunded=await db.query("SELECT 1 FROM refunds WHERE payment_id=$1 LIMIT 1",[id]);
    if(refunded.rowCount!==0)throw new FinanceConflictError(); // avoid returning funds twice
    const result=await db.query(`UPDATE payments SET status='reversed',reversed_at=NOW(),reversed_by=$2,reversal_reason=$3
      WHERE id=$1 AND status='posted'`,[id,ctx.userId,reason]);
    if(result.rowCount!==1)throw new FinanceConflictError();
    await refreshBalances(db,rows);
    await db.query(`INSERT INTO payment_status_events(id,payment_id,old_status,new_status,reason,actor_user_id,request_id)
       VALUES($1,$2,'posted','reversed',$3,$4,$5)`,[crypto.randomUUID(),id,reason,ctx.userId,rid]);
    await audit(db,ctx,rid,"PAYMENT_REVERSED",id,pay.branch_id);
    return {id,status:"reversed"};
   });
  },
  async refund(ctx:AuthorizationContext,rid:string,input:unknown){
   const o=object(input,["paymentAllocationId","amount","refundMethod","reason","idempotencyKey"]);
   const allocationId=validUuid(o.paymentAllocationId),key=validUuid(o.idempotencyKey),
    amount=positive(o.amount),refundMethod=method(o.refundMethod),reason=description(o.reason,500,5);
   if(!reason)throw new FinanceInputError();
   const hash=fingerprint([allocationId,amount,refundMethod,reason]);
   return pool.withTransaction(async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[ctx.userId,key]);
    const prior=await db.query<{id:string;request_fingerprint:string;branch_id:string}>(`SELECT r.id,r.request_fingerprint,p.branch_id FROM refunds r
      JOIN payments p ON p.id=r.payment_id WHERE r.recorded_by=$1 AND r.idempotency_key=$2`,[ctx.userId,key]);
    if(prior.rows[0]){
     authorized(ctx,"finance.refund.record",prior.rows[0].branch_id);
     if(prior.rows[0].request_fingerprint!==hash)throw new FinanceConflictError();
     return {id:prior.rows[0].id,status:"recorded",replayed:true};
    }
    const a=await db.query<{id:string;payment_id:string;invoice_id:string;branch_id:string;amount:string;status:string}>(`SELECT pa.id,pa.payment_id,pa.invoice_id,pa.branch_id,pa.amount,p.status FROM payment_allocations pa
     JOIN payments p ON p.id=pa.payment_id WHERE pa.id=$1`,[allocationId]);
    const record=a.rows[0];if(!record)throw new AuthorizationError("AUTHORIZATION_DENIED");
    authorized(ctx,"finance.refund.record",record.branch_id);
    const rows=await invoiceRows(db,[record.invoice_id]);
    const lock=await db.query("SELECT id FROM payments WHERE id=$1 AND status='posted' FOR UPDATE",[record.payment_id]);
    if(lock.rowCount!==1||rows.length!==1||rows[0].status!=="finalized")throw new FinanceConflictError();
    const previous=await db.query<{amount:string}>("SELECT COALESCE(SUM(amount),0)::text AS amount FROM refunds WHERE payment_allocation_id=$1",[allocationId]);
    if(cents(previous.rows[0]?.amount??"0")+amount>cents(record.amount))throw new FinanceConflictError();
    const id=crypto.randomUUID();
    await db.query(`INSERT INTO refunds(id,payment_id,payment_allocation_id,invoice_id,amount,refund_method,reason,recorded_by,idempotency_key,request_fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
     [id,record.payment_id,allocationId,record.invoice_id,peso(amount),refundMethod,reason,ctx.userId,key,hash]);
    await refreshBalances(db,rows);
    await audit(db,ctx,rid,"REFUND_RECORDED",id,record.branch_id);
    return {id,status:"recorded",amount:peso(amount),replayed:false};
   });
  },
  async read(ctx:AuthorizationContext,rawId:unknown){
   const id=validUuid(rawId);
   const r=await pool.query<PaymentRow>("SELECT id,patient_id,branch_id,status,amount,request_fingerprint FROM payments WHERE id=$1",[id]);
   const p=r.rows[0];if(!p)throw new AuthorizationError("AUTHORIZATION_DENIED");
   authorized(ctx,"finance.payment.read",p.branch_id);
   return {id:p.id,status:p.status,amount:p.amount,receiptNumber:null};
  }
 };
}
