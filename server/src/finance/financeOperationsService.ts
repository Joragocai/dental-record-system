import crypto from "node:crypto";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {AuthorizationContext} from "../services/authorizationService.js";
import {AuthorizationError} from "../services/authorizationErrors.js";
import {cents,peso,FinanceInputError} from "./invoiceMoney.js";
import {FinanceConflictError} from "./invoiceLifecycleService.js";
import {createAuditEventRepository} from "../repositories/auditEventRepository.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const methodNames=["Cash","GCash","Bank Transfer","Credit Card","Debit Card","Cheque","Other"];
function id(v:unknown){if(typeof v!=="string"||!uuid.test(v))throw new FinanceInputError();return v.toLowerCase()}
function value(v:unknown,min:number,max:number){if(typeof v!=="string"||v.trim().length<min||v.trim().length>max)throw new FinanceInputError();return v.trim()}
function optional(v:unknown,max:number){return v==null?null:value(v,1,max)}
function object(v:unknown,keys:string[]){if(!v||typeof v!=="object"||Array.isArray(v))throw new FinanceInputError();const o=v as Record<string,unknown>;if(Object.keys(o).some(k=>!keys.includes(k)))throw new FinanceInputError();return o}
function date(v:unknown){const s=value(v,10,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+"T00:00:00Z")))throw new FinanceInputError();return s}
function positive(v:unknown){const n=cents(v);if(n===0)throw new FinanceInputError();return n}
function allowed(ctx:AuthorizationContext,code:string,branch:string|null){
 if(ctx.status!=="active"||!ctx.permissions.some(p=>p.code===code&&(branch===null?p.scope==="GLOBAL":p.scope==="BRANCH"))||
 (branch===null?!ctx.roles.includes("CLINIC_ADMINISTRATOR"):(!ctx.roles.includes("PERSONNEL")&&!ctx.roles.includes("DENTIST")||!ctx.branchIds.includes(branch))))
 throw new AuthorizationError("AUTHORIZATION_DENIED");
}
async function audit(db:PgQueryExecutor,ctx:AuthorizationContext,rid:string,action:string,target:string,branch:string){
 await createAuditEventRepository(db).insert({id:crypto.randomUUID(),actorUserId:ctx.userId,actorAuthUserId:ctx.authUserId,
 action,targetType:"FINANCE",targetId:target,branchId:branch,outcome:"SUCCESS",metadata:{internal:true},
 occurredAt:new Date().toISOString(),requestId:rid});
}
function fp(values:unknown[]){return crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex")}
export function createFinanceOperationsService(pool:PgPoolManager){
 return {
  async collectibles(ctx:AuthorizationContext,branchId:unknown){
   const branch=id(branchId);allowed(ctx,"finance.receivables.read",branch);
   const q=await pool.query<{id:string;patient_id:string;balance_due:string;due_date:string|null;days_overdue:number;aging_bucket:string}>(`SELECT i.id,i.patient_id,i.balance_due::text,i.due_date,
    CASE WHEN i.due_date IS NULL THEN 0 ELSE GREATEST(0,CURRENT_DATE-i.due_date)::int END AS days_overdue,
    CASE WHEN i.due_date IS NULL OR i.due_date>=CURRENT_DATE THEN 'Current'
     WHEN CURRENT_DATE-i.due_date<=30 THEN '1-30'
     WHEN CURRENT_DATE-i.due_date<=60 THEN '31-60'
     WHEN CURRENT_DATE-i.due_date<=90 THEN '61-90'
     ELSE '90+' END AS aging_bucket
    FROM invoices i WHERE i.branch_id=$1 AND i.status='finalized' AND i.balance_due>0
    ORDER BY i.due_date NULLS LAST,i.id LIMIT 200`,[branch]);
   return q.rows;
  },
  async followup(ctx:AuthorizationContext,rid:string,raw:unknown){
   const o=object(raw,["invoiceId","note","nextFollowupDate"]);
   const invoiceId=id(o.invoiceId),note=value(o.note,5,500),next=o.nextFollowupDate==null?null:date(o.nextFollowupDate);
   return pool.withTransaction(async db=>{
    const q=await db.query<{branch_id:string;status:string}>("SELECT branch_id,status FROM invoices WHERE id=$1 FOR UPDATE",[invoiceId]);
    const invoice=q.rows[0];if(!invoice)throw new AuthorizationError("AUTHORIZATION_DENIED");
    allowed(ctx,"finance.receivables.followup",invoice.branch_id);
    if(invoice.status!=="finalized")throw new FinanceConflictError();
    const fid=crypto.randomUUID();
    await db.query("INSERT INTO receivable_followups(id,invoice_id,branch_id,note,next_followup_date,recorded_by) VALUES($1,$2,$3,$4,$5,$6)",
     [fid,invoiceId,invoice.branch_id,note,next,ctx.userId]);
    await audit(db,ctx,rid,"RECEIVABLE_FOLLOWUP_RECORDED",fid,invoice.branch_id);
    return {id:fid,status:"recorded"};
   });
  },
  async supplier(ctx:AuthorizationContext,rid:string,raw:unknown){
   const o=object(raw,["branchId","name","contactName","phone","email"]);
   const branch=id(o.branchId);allowed(ctx,"finance.supplier.create",branch);
   const name=value(o.name,2,150),contact=optional(o.contactName,120),phone=optional(o.phone,40),email=optional(o.email,254);
   return pool.withTransaction(async db=>{
    const supplierId=crypto.randomUUID();
    await db.query("INSERT INTO suppliers(id,branch_id,name,contact_name,phone,email,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
     [supplierId,branch,name,contact,phone,email,ctx.userId]);
    await audit(db,ctx,rid,"SUPPLIER_REGISTERED",supplierId,branch);
    return {id:supplierId,status:"active"};
   });
  },
  async suppliers(ctx:AuthorizationContext,rawBranch:unknown){
   const branch=id(rawBranch);allowed(ctx,"finance.supplier.read",branch);
   const q=await pool.query<{id:string;name:string;status:string}>("SELECT id,name,status FROM suppliers WHERE branch_id=$1 ORDER BY name,id LIMIT 200",[branch]);
   return q.rows;
  },
  async expense(ctx:AuthorizationContext,rid:string,raw:unknown){
   const o=object(raw,["branchId","expenseDate","categoryCode","description","supplierId","amount"]);
   const branch=id(o.branchId);allowed(ctx,"finance.expense.create",branch);
   const dateOnly=date(o.expenseDate),category=value(o.categoryCode,3,36),description=value(o.description,5,500);
   const supplierId=o.supplierId==null?null:id(o.supplierId),amount=peso(positive(o.amount));
   return pool.withTransaction(async db=>{
    const expenseId=crypto.randomUUID();
    await db.query(`INSERT INTO expenses(id,branch_id,expense_date,category_code,description,supplier_id,amount,entered_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[expenseId,branch,dateOnly,category,description,supplierId,amount,ctx.userId]);
    await audit(db,ctx,rid,"EXPENSE_SUBMITTED",expenseId,branch);
    return {id:expenseId,approvalStatus:"pending",paid:false};
   });
  },
  async expenses(ctx:AuthorizationContext,rawBranch:unknown){
   const branch=id(rawBranch);allowed(ctx,"finance.expense.read",branch);
   const q=await pool.query<{id:string;description:string;amount:string;approval_status:string}>(`SELECT id,description,amount::text,approval_status FROM expenses WHERE branch_id=$1
    ORDER BY expense_date DESC,id DESC LIMIT 200`,[branch]);return q.rows;
  },
  async review(ctx:AuthorizationContext,rid:string,type:"expense"|"payable",rawId:unknown,raw:unknown){
   const target=id(rawId),o=object(raw,["decision","reason"]);const decision=value(o.decision,7,8);
   if(decision!=="approved"&&decision!=="rejected")throw new FinanceInputError();
   const reason=decision==="rejected"?value(o.reason,5,500):null;
   if(decision==="approved"&&o.reason!=null)throw new FinanceInputError();
   const table=type==="expense"?"expenses":"accounts_payable";
   return pool.withTransaction(async db=>{
    const q=await db.query<{branch_id:string;approval_status:string}>(`SELECT branch_id,approval_status FROM ${table} WHERE id=$1 FOR UPDATE`,[target]);
    const row=q.rows[0];if(!row)throw new AuthorizationError("AUTHORIZATION_DENIED");
    allowed(ctx,type==="expense"?"finance.expense.approve":"finance.payable.approve",null);
    if(row.approval_status!=="pending")throw new FinanceConflictError();
    const u=await db.query(`UPDATE ${table} SET approval_status=$2,approved_by=$3,approved_at=NOW(),rejection_reason=$4 WHERE id=$1 AND approval_status='pending'`,
     [target,decision,ctx.userId,reason]);
    if(u.rowCount!==1)throw new FinanceConflictError();
    await audit(db,ctx,rid,type==="expense"?"EXPENSE_REVIEWED":"PAYABLE_REVIEWED",target,row.branch_id);
    return {id:target,approvalStatus:decision};
   });
  },
  async payable(ctx:AuthorizationContext,rid:string,raw:unknown){
   const o=object(raw,["branchId","supplierId","billNumber","billDate","dueDate","description","amount"]);
   const branch=id(o.branchId);allowed(ctx,"finance.payable.create",branch);
   const supplier=id(o.supplierId),number=value(o.billNumber,1,100),billDate=date(o.billDate),
    due=o.dueDate==null?null:date(o.dueDate),description=optional(o.description,500),amount=peso(positive(o.amount));
   if(due&&due<billDate)throw new FinanceInputError();
   return pool.withTransaction(async db=>{
    const payableId=crypto.randomUUID();
    await db.query(`INSERT INTO accounts_payable(id,branch_id,supplier_id,bill_number,bill_date,due_date,
       description,original_amount,outstanding_amount,entered_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9)`,
     [payableId,branch,supplier,number,billDate,due,description,amount,ctx.userId]);
    await audit(db,ctx,rid,"PAYABLE_SUBMITTED",payableId,branch);
    return {id:payableId,approvalStatus:"pending",paymentStatus:"unpaid"};
   });
  },
  async payables(ctx:AuthorizationContext,rawBranch:unknown){
   const branch=id(rawBranch);allowed(ctx,"finance.payable.read",branch);
   const q=await pool.query<{id:string;bill_number:string;outstanding_amount:string;approval_status:string;payment_status:string}>(`SELECT id,bill_number,outstanding_amount::text,approval_status,payment_status
      FROM accounts_payable WHERE branch_id=$1 ORDER BY due_date NULLS LAST,id LIMIT 200`,[branch]);return q.rows;
  },
  async payablePayment(ctx:AuthorizationContext,rid:string,payableRaw:unknown,raw:unknown){
   const payableId=id(payableRaw),o=object(raw,["amount","paymentMethod","referenceNumber","idempotencyKey"]);
   const amount=positive(o.amount),method=value(o.paymentMethod,4,20),reference=optional(o.referenceNumber,120),key=id(o.idempotencyKey);
   if(!["Cash","GCash","Bank Transfer","Credit Card","Debit Card","Cheque","Other"].includes(method))throw new FinanceInputError();
   const hash=fp([payableId,amount,method,reference]);
   return pool.withTransaction(async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[ctx.userId,key]);
    const q=await db.query<{branch_id:string;approval_status:string;outstanding_amount:string;original_amount:string}>(`SELECT branch_id,approval_status,outstanding_amount::text,original_amount::text FROM accounts_payable WHERE id=$1 FOR UPDATE`,[payableId]);
    const bill=q.rows[0];if(!bill)throw new AuthorizationError("AUTHORIZATION_DENIED");
    allowed(ctx,"finance.payable.pay",bill.branch_id);
    const old=await db.query<{id:string;payable_id:string;request_fingerprint:string}>(`SELECT id,payable_id,request_fingerprint FROM payable_payments WHERE recorded_by=$1 AND idempotency_key=$2`,[ctx.userId,key]);
    if(old.rows[0]){if(old.rows[0].payable_id!==payableId||old.rows[0].request_fingerprint!==hash)throw new FinanceConflictError();return{id:old.rows[0].id,replayed:true}}
    if(bill.approval_status!=="approved"||amount>cents(bill.outstanding_amount))throw new FinanceConflictError();
    const paymentId=crypto.randomUUID(),outstanding=cents(bill.outstanding_amount)-amount,paid=cents(bill.original_amount)-outstanding;
    await db.query(`INSERT INTO payable_payments(id,payable_id,branch_id,amount,payment_method,reference_number,
      recorded_by,idempotency_key,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [paymentId,payableId,bill.branch_id,peso(amount),method,reference,ctx.userId,key,hash]);
    const u=await db.query(`UPDATE accounts_payable SET amount_paid=$2,outstanding_amount=$3,
      payment_status=$4 WHERE id=$1 AND approval_status='approved'`,
      [payableId,peso(paid),peso(outstanding),outstanding===0?"paid":"partial"]);
    if(u.rowCount!==1)throw new FinanceConflictError();
    await audit(db,ctx,rid,"PAYABLE_PAYMENT_RECORDED",paymentId,bill.branch_id);
    return {id:paymentId,amount:peso(amount),status:outstanding===0?"paid":"partial",replayed:false};
   });
  }
 };
}
