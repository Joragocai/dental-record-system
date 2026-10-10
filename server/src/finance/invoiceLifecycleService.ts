import crypto from "node:crypto";
import type {PgPoolManager} from "../postgres/pool.js";
import type {AuthorizationContext} from "../services/authorizationService.js";
import {AuthorizationError} from "../services/authorizationErrors.js";
import {FinanceInputError,cents,peso} from "./invoiceMoney.js";
import {createAuditEventRepository} from "../repositories/auditEventRepository.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class FinanceConflictError extends Error {readonly status=409;constructor(){super("Invoice cannot undergo this transition.")}}
export function createInvoiceLifecycleService(pool:PgPoolManager){
 function assertPermission(ctx:AuthorizationContext,branch:string,code:"finance.invoice.finalize"|"finance.invoice.void"){
  if(ctx.status!=="active"||!ctx.branchIds.includes(branch)||!ctx.roles.some(r=>r==="PERSONNEL"||r==="DENTIST")||
   !ctx.permissions.some(p=>p.code===code&&p.scope==="BRANCH"))throw new AuthorizationError("AUTHORIZATION_DENIED");
 }
 async function change(ctx:AuthorizationContext,requestId:string,invoiceId:unknown,
  kind:"finalize"|"void",payload:unknown){
  if(typeof invoiceId!=="string"||!uuid.test(invoiceId))throw new FinanceInputError();
  if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new FinanceInputError();
  const body=payload as Record<string,unknown>;
  const reason=kind==="void"&&typeof body.reason==="string"?body.reason.trim():null;
  if(kind==="finalize"&&Object.keys(body).length!==0)throw new FinanceInputError();
  if(kind==="void"&&(Object.keys(body).length!==1||!reason||reason.length<5||reason.length>500))throw new FinanceInputError();
  return pool.withTransaction(async db=>{
   const q=await db.query<{id:string;branch_id:string;status:string;internal_reference:string|null;subtotal:string;discount_total:string;total_amount:string;balance_due:string;amount_paid:string;invoice_date:string|Date}>(
    "SELECT id,branch_id,status,internal_reference,subtotal,discount_total,total_amount,balance_due,amount_paid,invoice_date FROM invoices WHERE id=$1 FOR UPDATE",[invoiceId]);
   const item=q.rows[0];if(!item)throw new AuthorizationError("AUTHORIZATION_DENIED");
   assertPermission(ctx,item.branch_id,kind==="finalize"?"finance.invoice.finalize":"finance.invoice.void");
   if(item.status!==(kind==="finalize"?"draft":"finalized"))throw new FinanceConflictError();
   const amount=cents(item.subtotal)-cents(item.discount_total);
   if(amount!==cents(item.total_amount)||amount!==cents(item.balance_due)||cents(item.amount_paid)!==0)throw new FinanceConflictError();
   const totals=await db.query<{unit_price:string;discount_amount:string;line_total:string}>(
    "SELECT unit_price,discount_amount,line_total FROM invoice_items WHERE invoice_id=$1 FOR UPDATE",[invoiceId]);
   if(totals.rows.length!==1||totals.rows.some(r=>cents(r.unit_price)-cents(r.discount_amount)!==cents(r.line_total))||
    totals.rows.reduce((v,r)=>v+cents(r.line_total),0)!==amount)throw new FinanceConflictError();
   let internalReference=item.internal_reference;
   const now=new Date().toISOString();
   if(kind==="finalize"){
    const invoiceYear=new Date(item.invoice_date).getUTCFullYear();
    if(!Number.isInteger(invoiceYear)||invoiceYear<2020)throw new FinanceConflictError();
    const seq=await db.query<{last_sequence:number}>(
     `INSERT INTO finance_reference_counters(calendar_year,last_sequence) VALUES($1,1)
      ON CONFLICT(calendar_year) DO UPDATE SET last_sequence=finance_reference_counters.last_sequence+1
      RETURNING last_sequence`,[invoiceYear]);
    const index=Number(seq.rows[0]?.last_sequence);
    if(!Number.isSafeInteger(index)||index>999999)throw new FinanceConflictError();
    internalReference="INT-"+invoiceYear+"-"+String(index).padStart(6,"0");
    const update=await db.query("UPDATE invoices SET status='finalized',internal_reference=$2,finalized_at=NOW(),finalized_by=$3,updated_at=NOW() WHERE id=$1 AND status='draft'",
     [invoiceId,internalReference,ctx.userId]);
    if(update.rowCount!==1)throw new FinanceConflictError();
   }else{
    if(!internalReference)throw new FinanceConflictError();
    const update=await db.query("UPDATE invoices SET status='void',voided_at=NOW(),voided_by=$2,void_reason=$3,updated_at=NOW() WHERE id=$1 AND status='finalized'",
     [invoiceId,ctx.userId,reason]);
    if(update.rowCount!==1)throw new FinanceConflictError();
   }
   await db.query(`INSERT INTO invoice_status_events(id,invoice_id,old_status,new_status,reason,actor_user_id,request_id,occurred_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,NOW())`,
     [crypto.randomUUID(),invoiceId,kind==="finalize"?"draft":"finalized",kind==="finalize"?"finalized":"void",reason,ctx.userId,requestId]);
   await createAuditEventRepository(db).insert({id:crypto.randomUUID(),actorUserId:ctx.userId,actorAuthUserId:ctx.authUserId,
    requestId,action:kind==="finalize"?"INTERNAL_INVOICE_FINALIZED":"INTERNAL_INVOICE_VOIDED",
    targetType:"INVOICE",targetId:invoiceId,branchId:item.branch_id,outcome:"SUCCESS",
    metadata:{internalReference,notOfficialReceipt:true},occurredAt:now});
   return {id:invoiceId,status:kind==="finalize"?"finalized":"void",internalReference,totalAmount:peso(amount)};
  });
 }
 return {finalize:(ctx:AuthorizationContext,rid:string,id:unknown,body:unknown)=>change(ctx,rid,id,"finalize",body),
  void:(ctx:AuthorizationContext,rid:string,id:unknown,body:unknown)=>change(ctx,rid,id,"void",body)};
}
