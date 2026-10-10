import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {AuthorizationContext} from "../services/authorizationService.js";
import {createPatientOwnershipService} from "../services/patientOwnershipService.js";
import {createPatientAccountRepository} from "../repositories/patientAccountRepository.js";
import {createAuditEventRepository} from "../repositories/auditEventRepository.js";
import crypto from "node:crypto";
export function createPatientFinanceService(pool:PgPoolManager){
 async function own(c:AuthorizationContext,code:"portal.balance.read"|"portal.payments.read"){
  return createPatientOwnershipService(createPatientAccountRepository(pool)).requireOwnPatient(c,code);
 }
 async function audit(db:PgQueryExecutor,c:AuthorizationContext,rid:string,action:string,patient:string){
  await createAuditEventRepository(db).insert({id:crypto.randomUUID(),actorUserId:c.userId,
   actorAuthUserId:c.authUserId,requestId:rid,action,targetType:"PATIENT",targetId:patient,
   branchId:null,outcome:"SUCCESS",metadata:{portalFinance:true},occurredAt:new Date().toISOString()});
 }
 return {
  async balance(c:AuthorizationContext,rid:string){
   const patient=await own(c,"portal.balance.read");
   return pool.withTransaction(async db=>{
    const q=await db.query<{invoiced:string;outstanding:string}>(`SELECT COALESCE(SUM(total_amount),0)::text AS invoiced,
      COALESCE(SUM(balance_due),0)::text AS outstanding FROM invoices
      WHERE patient_id=$1 AND status='finalized'`,[patient]);
    await audit(db,c,rid,"PATIENT_BALANCE_VIEWED",patient);
    return {invoiced:q.rows[0]?.invoiced??"0.00",outstanding:q.rows[0]?.outstanding??"0.00",
      note:"Only finalized invoices in the new ledger; unbilled historical treatments are excluded.",ledgerOnly:true};
   });
  },
  async payments(c:AuthorizationContext,rid:string){
   const patient=await own(c,"portal.payments.read");
   return pool.withTransaction(async db=>{
    const q=await db.query<{id:string;payment_date:string;amount:string;payment_method:string;status:string}>(`SELECT id,payment_date,amount::text,payment_method,status
      FROM payments WHERE patient_id=$1 ORDER BY payment_date DESC,id DESC LIMIT 100`,[patient]);
    await audit(db,c,rid,"PATIENT_PAYMENTS_VIEWED",patient);
    return q.rows.map(row=>({id:row.id,date:row.payment_date,amount:row.amount,
      method:row.payment_method,status:row.status,officialReceiptNumber:null}));
   });
  }
 };
}
