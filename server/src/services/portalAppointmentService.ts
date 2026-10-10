import crypto from "node:crypto";
import type {PgPoolManager} from "../postgres/pool.js";
import type {AuthorizationContext} from "./authorizationService.js";
import {createPatientOwnershipService} from "./patientOwnershipService.js";
import {createPatientAccountRepository} from "../repositories/patientAccountRepository.js";
import {createAuditEventRepository} from "../repositories/auditEventRepository.js";
import {normalizeDate,normalizeTime,normalizeOptionalText,assertNotPastSchedule,requireAppointmentUuid} from "./appointmentValidation.js";
import {AuthorizationError} from "./authorizationErrors.js";
import {AppointmentDomainError} from "./appointmentDomainErrors.js";
import {normalizePgDateOnly} from "../postgres/dateOnly.js";

export class PortalAppointmentError extends Error {
 readonly status:number;
 constructor(message="Patient appointment request could not be processed.",status=400){super(message);this.status=status}
}
function safeError(error:unknown):never{
 if(error instanceof PortalAppointmentError || error instanceof AuthorizationError)throw error;
 if(error instanceof AppointmentDomainError)throw new PortalAppointmentError("Appointment request details are invalid.",400);
 if(error&&typeof error==="object"&&"code" in error&&error.code==="23505")
  throw new PortalAppointmentError("A pending appointment request already exists.",409);
 throw new PortalAppointmentError("Appointment request service is unavailable.",503);
}
function inputObject(input:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!input||typeof input!=="object"||Array.isArray(input))throw new PortalAppointmentError();
 const data=input as Record<string,unknown>;
 if(Object.keys(data).some(key=>!keys.includes(key)))throw new PortalAppointmentError();
 return data;
}
export function createPortalAppointmentService(pool:PgPoolManager){
 async function owner(context:AuthorizationContext){
  return createPatientOwnershipService(createPatientAccountRepository(pool)).requireOwnPatient(context,"portal.appointments.request");
 }
 async function audit(db:Parameters<Parameters<PgPoolManager["withTransaction"]>[0]>[0],ctx:AuthorizationContext,requestId:string,targetId:string,action:string){
  await createAuditEventRepository(db).insert({id:crypto.randomUUID(),actorUserId:ctx.userId,actorAuthUserId:ctx.authUserId,
   requestId,action,targetType:"APPOINTMENT",targetId,branchId:null,outcome:"SUCCESS",metadata:{patientRequest:true},occurredAt:new Date().toISOString()});
 }
 return {
  async create(context:AuthorizationContext,requestId:string,input:unknown){
   const patientId=await owner(context);
   const data=inputObject(input,["branchId","appointmentDate","appointmentTime","plannedProcedure","idempotencyKey"]);
   const branchId=requireAppointmentUuid(data.branchId),date=normalizeDate(data.appointmentDate);
   const time=normalizeTime(data.appointmentTime);
   assertNotPastSchedule(date,time,new Date());
   const procedure=normalizeOptionalText(data.plannedProcedure,200);
   const key=requireAppointmentUuid(data.idempotencyKey);
   const fingerprint=crypto.createHash("sha256").update(JSON.stringify([patientId,branchId,date,time,procedure])).digest("hex");
   try{return await pool.withTransaction(async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[context.userId,key]);
    const prior=await db.query<{appointment_id:string;request_fingerprint:string}>("SELECT appointment_id,request_fingerprint FROM patient_appointment_creation_keys WHERE requested_by_user_id=$1 AND idempotency_key=$2",[context.userId,key]);
    if(prior.rows[0]){
     if(prior.rows[0].request_fingerprint!==fingerprint)throw new PortalAppointmentError("Idempotency key already used.",409);
     return {id:prior.rows[0].appointment_id,status:"requested",replayed:true};
    }
    const branch=await db.query("SELECT 1 FROM branches WHERE id=$1",[branchId]);
    if(branch.rowCount!==1)throw new PortalAppointmentError("Selected clinic branch is unavailable.",404);
    const id=crypto.randomUUID();
    await db.query(`INSERT INTO appointments(id,patient_id,branch_id,appointment_date,appointment_time,planned_procedure,notes,status,
     dentist_user_id,duration_minutes,rescheduled_from_appointment_id,created_at,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,NULL,'requested',NULL,NULL,NULL,NOW(),NOW())`,[id,patientId,branchId,date,time,procedure]);
    await db.query(`INSERT INTO appointment_history(id,appointment_id,action,new_status,new_branch_id,new_appointment_date,
      new_appointment_time,actor_user_id,request_id,occurred_at)
      VALUES($1,$2,'PATIENT_REQUESTED','requested',$3,$4,$5,$6,$7,NOW())`,[crypto.randomUUID(),id,branchId,date,time,context.userId,requestId]);
    await db.query("INSERT INTO patient_appointment_creation_keys(requested_by_user_id,idempotency_key,appointment_id,request_fingerprint) VALUES($1,$2,$3,$4)",[context.userId,key,id,fingerprint]);
    await audit(db,context,requestId,id,"PATIENT_APPOINTMENT_REQUESTED");
    return {id,status:"requested",replayed:false};
   });}catch(error){return safeError(error)}
  },
  async change(context:AuthorizationContext,requestId:string,appointmentId:unknown,kind:"cancel"|"reschedule",input:unknown){
   const patientId=await owner(context),aid=requireAppointmentUuid(appointmentId);
   const keys=kind==="cancel"?["reason","idempotencyKey"]:["reason","idempotencyKey","branchId","appointmentDate","appointmentTime"];
   const data=inputObject(input,keys);
   const key=requireAppointmentUuid(data.idempotencyKey);
   const reason=normalizeOptionalText(data.reason,500);
   const branchId=kind==="reschedule"?requireAppointmentUuid(data.branchId):null;
   const date=kind==="reschedule"?normalizeDate(data.appointmentDate):null;
   const time=kind==="reschedule"?normalizeTime(data.appointmentTime):null;
   if(date)assertNotPastSchedule(date,time,new Date());
   const fingerprint=crypto.createHash("sha256").update(JSON.stringify([patientId,aid,kind,reason,branchId,date,time])).digest("hex");
   try{return await pool.withTransaction(async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[context.userId,key]);
    const original=await db.query<{id:string;status:string}>("SELECT id,status FROM appointments WHERE id=$1 AND patient_id=$2 FOR UPDATE",[aid,patientId]);
    if(!original.rows[0])throw new AuthorizationError("AUTHORIZATION_DENIED");
    const old=await db.query<{id:string;request_type:string;appointment_id:string;status:string;request_fingerprint:string}>(
      "SELECT id,request_type,appointment_id,status,request_fingerprint FROM patient_appointment_requests WHERE requested_by_user_id=$1 AND idempotency_key=$2",[context.userId,key]);
    if(old.rows[0]){
     if(old.rows[0].appointment_id!==aid||old.rows[0].request_type!==kind||old.rows[0].request_fingerprint!==fingerprint)throw new PortalAppointmentError("Idempotency key already used.",409);
     return {id:old.rows[0].id,status:old.rows[0].status,replayed:true};
    }
    if(!["requested","pending_confirmation","confirmed"].includes(original.rows[0].status))throw new PortalAppointmentError("Appointment cannot be changed in this status.",409);
    if(branchId){
     const branch=await db.query("SELECT 1 FROM branches WHERE id=$1",[branchId]);
     if(branch.rowCount!==1)throw new PortalAppointmentError("Selected clinic branch is unavailable.",404);
    }
    const id=crypto.randomUUID();
    await db.query(`INSERT INTO patient_appointment_requests(id,patient_id,appointment_id,requested_by_user_id,request_type,status,
     requested_branch_id,requested_date,requested_time,reason,idempotency_key,request_fingerprint,created_at)
     VALUES($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,NOW())`,
     [id,patientId,aid,context.userId,kind,branchId,date,time,reason,key,fingerprint]);
    await audit(db,context,requestId,aid,kind==="cancel"?"PATIENT_CANCELLATION_REQUESTED":"PATIENT_RESCHEDULE_REQUESTED");
    return {id,status:"pending",replayed:false};
   });}catch(error){return safeError(error)}
  },
  async branches(context:AuthorizationContext){
   await owner(context);
   const r=await pool.query<{id:string;branch_name:string}>("SELECT id,branch_name FROM branches ORDER BY branch_name ASC LIMIT 100");
   return r.rows.map(x=>({id:x.id,name:x.branch_name}));
  },
  async list(context:AuthorizationContext){
   const patientId=await owner(context);
   const r=await pool.query<{id:string;appointment_id:string;request_type:string;status:string;requested_date:string|Date|null;reason:string|null}>(
    "SELECT id,appointment_id,request_type,status,requested_date,reason FROM patient_appointment_requests WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 100",[patientId]);
   return r.rows.map(row=>({...row,requested_date:row.requested_date===null?null:normalizePgDateOnly(row.requested_date,"requested date")}));
  }
 }
}
