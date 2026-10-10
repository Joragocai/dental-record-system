import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {AuthorizationContext} from "./authorizationService.js";
import {createAppointmentDomainService,type AppointmentDomainService} from "./appointmentDomainService.js";
import {createAuditEventRepository} from "../repositories/auditEventRepository.js";
import {normalizePgDateOnly} from "../postgres/dateOnly.js";
import crypto from "node:crypto";
import {requireAppointmentUuid} from "./appointmentValidation.js";
import {AuthorizationError} from "./authorizationErrors.js";
import {PortalAppointmentError} from "./portalAppointmentService.js";
export function createPortalAppointmentReviewService(pool:PgPoolManager, domainFactory:(target:PgPoolManager)=>Pick<AppointmentDomainService,"cancelAppointment"|"rescheduleAppointment">=createAppointmentDomainService){
 function permission(ctx:AuthorizationContext,type:string,branch:string){
  const required=type==="cancel"?"appointment.cancel":"appointment.reschedule";
  if(ctx.status!=="active"||!ctx.roles.some(r=>r==="PERSONNEL"||r==="DENTIST")||
   !ctx.branchIds.includes(branch)||!ctx.permissions.some(p=>p.code===required&&p.scope==="BRANCH"))
   throw new AuthorizationError("AUTHORIZATION_DENIED");
 }
 function actor(ctx:AuthorizationContext,requestId:string){
  return {userId:ctx.userId,authUserId:ctx.authUserId,requestId,branchIds:ctx.branchIds,
   permissions:ctx.permissions.map(p=>p.code)};
 }
 return {
  async pending(ctx:AuthorizationContext,branchIdValue:unknown){
   const branchId=requireAppointmentUuid(branchIdValue);
   if(ctx.status!=="active"||!ctx.branchIds.includes(branchId)||!ctx.roles.some(r=>r==="PERSONNEL"||r==="DENTIST")||
    !ctx.permissions.some(p=>p.scope==="BRANCH"&&(p.code==="appointment.cancel"||p.code==="appointment.reschedule")))
    throw new AuthorizationError("AUTHORIZATION_DENIED");
   const r=await pool.query<{id:string;appointment_id:string;request_type:string;requested_date:string|null;requested_time:string|null;requested_branch_id:string|null;reason:string|null;created_at:string}>(
    `SELECT pr.id,pr.appointment_id,pr.request_type,pr.requested_date,pr.requested_time,pr.requested_branch_id,pr.reason,pr.created_at
     FROM patient_appointment_requests pr JOIN appointments a ON a.id=pr.appointment_id
     WHERE pr.status='pending' AND a.branch_id=$1 ORDER BY pr.created_at ASC LIMIT 100`,[branchId]);
   return r.rows.filter(row=>ctx.permissions.some(p=>p.code===(row.request_type==="cancel"?"appointment.cancel":"appointment.reschedule")&&p.scope==="BRANCH"));
  },
  async decide(ctx:AuthorizationContext,requestId:string,requestUuid:unknown,input:unknown){
   const rid=requireAppointmentUuid(requestUuid);
   if(!input||typeof input!=="object"||Array.isArray(input))throw new PortalAppointmentError();
   const data=input as Record<string,unknown>;
   if(typeof data.decision!=="string"||!["approved","rejected"].includes(data.decision)||
    Object.keys(data).some(k=>!["decision","dentistUserId","durationMinutes","appointmentTime"].includes(k)))throw new PortalAppointmentError();
   return pool.withTransaction(async db=>{
    const q=await db.query<{id:string;appointment_id:string;request_type:string;status:string;reason:string|null;requested_branch_id:string|null;requested_date:string|Date|null;requested_time:string|null;patient_id:string;actual_patient_id:string;branch_id:string}>(
     `SELECT pr.id,pr.appointment_id,pr.request_type,pr.status,pr.reason,pr.requested_branch_id,pr.requested_date,pr.requested_time,
       pr.patient_id,a.patient_id AS actual_patient_id,a.branch_id
      FROM patient_appointment_requests pr JOIN appointments a ON a.id=pr.appointment_id
      WHERE pr.id=$1 FOR UPDATE OF pr`,[rid]);
    const item=q.rows[0];
    if(!item)throw new AuthorizationError("AUTHORIZATION_DENIED");
    permission(ctx,item.request_type,item.branch_id);
    if(item.status!=="pending")throw new PortalAppointmentError("This request has already been reviewed.",409);
    if(item.patient_id!==item.actual_patient_id)throw new AuthorizationError("AUTHORIZATION_DENIED");
    if(data.decision==="approved"){
     const transactionPool:PgPoolManager={
      query:db.query,withTransaction:async callback=>callback(db),
      describeTarget:()=>pool.describeTarget(),isStarted:()=>pool.isStarted(),shutdown:()=>pool.shutdown()
     };
     const domain=domainFactory(transactionPool);
     if(item.request_type==="cancel"){
      if(data.dentistUserId!==undefined||data.durationMinutes!==undefined||data.appointmentTime!==undefined)throw new PortalAppointmentError();
      await domain.cancelAppointment(item.appointment_id,{reason:item.reason??"Approved patient cancellation request"},actor(ctx,requestId));
     }else{
      if(!item.requested_branch_id||!item.requested_date)throw new PortalAppointmentError();
      await domain.rescheduleAppointment(item.appointment_id,{
       branchId:item.requested_branch_id,appointmentDate:normalizePgDateOnly(item.requested_date,"requested appointment date"),
       appointmentTime:data.appointmentTime??(item.requested_time===null?null:String(item.requested_time).slice(0,5)),
       dentistUserId:data.dentistUserId,durationMinutes:data.durationMinutes,
       reason:item.reason??"Approved patient rescheduling request"
      },actor(ctx,requestId));
     }
    }else if(data.dentistUserId!==undefined||data.durationMinutes!==undefined||data.appointmentTime!==undefined){
     throw new PortalAppointmentError();
    }
    const changed=await db.query(
     "UPDATE patient_appointment_requests SET status=$2,reviewed_by_user_id=$3,reviewed_at=NOW() WHERE id=$1 AND status='pending'",[rid,data.decision,ctx.userId]);
    if(changed.rowCount!==1)throw new PortalAppointmentError("Request review conflict.",409);
    await createAuditEventRepository(db).insert({
     id:crypto.randomUUID(),actorUserId:ctx.userId,actorAuthUserId:ctx.authUserId,
     action:data.decision==="approved"?"PATIENT_APPOINTMENT_CHANGE_APPROVED":"PATIENT_APPOINTMENT_CHANGE_REJECTED",
     targetType:"PATIENT_APPOINTMENT_REQUEST",targetId:rid,branchId:item.branch_id,
     outcome:"SUCCESS",metadata:{requestType:item.request_type},
     occurredAt:new Date().toISOString(),requestId
    });
    return {id:rid,status:data.decision};
   });
  }
 };
}
