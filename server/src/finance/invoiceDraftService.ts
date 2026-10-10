import crypto from "node:crypto";
import type {PgPoolManager} from "../postgres/pool.js";
import type {AuthorizationContext} from "../services/authorizationService.js";
import {AuthorizationError} from "../services/authorizationErrors.js";
import {createAuditEventRepository} from "../repositories/auditEventRepository.js";
import {draftInvoiceAmounts,FinanceInputError} from "./invoiceMoney.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createInvoiceDraftService(pool:PgPoolManager){
 function allowed(ctx:AuthorizationContext,permission:"finance.invoice.draft"|"finance.invoice.read",branch:string){
  if(ctx.status!=="active"||!ctx.roles.some(r=>r==="PERSONNEL"||r==="DENTIST")||!ctx.branchIds.includes(branch)||
   !ctx.permissions.some(p=>p.code===permission&&p.scope==="BRANCH"))throw new AuthorizationError("AUTHORIZATION_DENIED");
 }
 return {
  async draft(ctx:AuthorizationContext,requestId:string,raw:unknown){
   if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new FinanceInputError();
   const o=raw as Record<string,unknown>;
   if(Object.keys(o).length!==1||typeof o.treatmentId!=="string"||!uuid.test(o.treatmentId))throw new FinanceInputError();
   return pool.withTransaction(async db=>{
    const q=await db.query<{id:string;patient_id:string;branch_id:string;procedure:string;amount_charged:string;discount_type:string;discount_percent:string;discount_amount:string;net_amount_due:string;amount_paid:string;balance:string}>(
     "SELECT id,patient_id,branch_id,procedure,amount_charged,discount_type,discount_percent,discount_amount,net_amount_due,amount_paid,balance FROM treatments WHERE id=$1 FOR UPDATE",[o.treatmentId]);
    const t=q.rows[0];if(!t)throw new AuthorizationError("AUTHORIZATION_DENIED");
    allowed(ctx,"finance.invoice.draft",t.branch_id);
    const values=draftInvoiceAmounts(t);
    const existing=await db.query("SELECT 1 FROM invoices WHERE treatment_id=$1",[t.id]);
    if(existing.rowCount!==0)throw new FinanceInputError();
    const id=crypto.randomUUID(),now=new Date().toISOString();
    await db.query(`INSERT INTO invoices(id,patient_id,branch_id,treatment_id,invoice_date,status,subtotal,discount_total,
     adjustment_total,total_amount,amount_paid,balance_due,created_by,created_at,updated_at)
     VALUES($1,$2,$3,$4,CURRENT_DATE,'draft',$5,$6,0,$7,0,$8,$9,$10,$10)`,
     [id,t.patient_id,t.branch_id,t.id,values.subtotal,values.discountTotal,values.totalAmount,values.balanceDue,ctx.userId,now]);
    await db.query(`INSERT INTO invoice_items(id,invoice_id,treatment_id,procedure_code,procedure_name,description,quantity,
     unit_price,discount_amount,line_total) VALUES($1,$2,$3,$4,$5,NULL,1,$6,$7,$8)`,
     [crypto.randomUUID(),id,t.id,t.id,t.procedure,values.subtotal,values.discountTotal,values.totalAmount]);
    await createAuditEventRepository(db).insert({id:crypto.randomUUID(),actorUserId:ctx.userId,actorAuthUserId:ctx.authUserId,
     action:"INVOICE_DRAFTED",targetType:"INVOICE",targetId:id,branchId:t.branch_id,outcome:"SUCCESS",
     metadata:{state:"draft"},occurredAt:now,requestId});
    return {id,status:"draft" as const,...values};
   });
  },
  async read(ctx:AuthorizationContext,requestId:string,rawId:unknown){
   if(typeof rawId!=="string"||!uuid.test(rawId))throw new FinanceInputError();
   return pool.withTransaction(async db=>{
    const q=await db.query<{id:string;branch_id:string;status:string;subtotal:string;discount_total:string;total_amount:string;balance_due:string}>(
      "SELECT id,branch_id,status,subtotal,discount_total,total_amount,balance_due FROM invoices WHERE id=$1",[rawId]);
    const r=q.rows[0];if(!r)throw new AuthorizationError("AUTHORIZATION_DENIED");
    allowed(ctx,"finance.invoice.read",r.branch_id);
    await createAuditEventRepository(db).insert({id:crypto.randomUUID(),actorUserId:ctx.userId,
     actorAuthUserId:ctx.authUserId,requestId,action:"INVOICE_DRAFT_VIEWED",targetType:"INVOICE",
     targetId:r.id,branchId:r.branch_id,outcome:"SUCCESS",metadata:{status:r.status},occurredAt:new Date().toISOString()});
    return {id:r.id,status:r.status,subtotal:r.subtotal,discountTotal:r.discount_total,totalAmount:r.total_amount,balanceDue:r.balance_due};
   });
  }
 };
}
