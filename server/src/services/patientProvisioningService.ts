import crypto from "node:crypto";
import type {PgPoolManager} from "../postgres/pool.js";
import type {AuthorizationContext} from "./authorizationService.js";
import {createPatientProvisioningRepository} from "../repositories/patientProvisioningRepository.js";
import {createAuditEventRepository} from "../repositories/auditEventRepository.js";
import {PatientEnrollmentError} from "./patientEnrollmentErrors.js";
import type {StaffProvisioningProvider} from "../staff/supabaseStaffProvisioningProvider.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(v:unknown){if(typeof v!=="string"||!uuid.test(v))throw new PatientEnrollmentError("INVALID_INPUT");return v.toLowerCase()}
function valid(t:Awaited<ReturnType<ReturnType<typeof createPatientProvisioningRepository>["getById"]>>){
 return !!t&&t.userStatus==="pending"&&t.linkStatus==="pending"&&t.roles.length===1&&t.roles[0]==="PATIENT"&&t.branchIds.length===0;
}
export function createPatientProvisioningService(pool:PgPoolManager,provider:StaffProvisioningProvider,redirect:string){
 return {
 async invite(targetId:string,actor:{userId:string;authUserId:string;requestId:string;authorization:AuthorizationContext}){
  const target=id(targetId);id(actor.userId);id(actor.authUserId);id(actor.requestId);
  const r=createPatientProvisioningRepository(pool);const t=await r.getById(target);
  if(!actor.authorization || actor.authorization.userId!==actor.userId || actor.authorization.authUserId!==actor.authUserId || actor.authorization.status!=="active" || !actor.authorization.roles.some(role=>role==="PERSONNEL" || role==="DENTIST") || !actor.authorization.permissions.some(p=>p.code==="patient.read"&&p.scope==="BRANCH") || !actor.authorization.permissions.some(p=>p.code==="patient.create"&&p.scope==="BRANCH") || !t || !actor.authorization.branchIds.includes(t.patientBranchId) || t.approvedByUserId!==actor.userId || !t.patientEmail || t.email.trim().toLowerCase()!==t.patientEmail.trim().toLowerCase()) throw new PatientEnrollmentError("NOT_ELIGIBLE");
  if(!valid(t))throw new PatientEnrollmentError("NOT_ELIGIBLE");
  if(t!.invitationState==="sent"&&t!.authUserId)return {id:target,invitation:"already_sent" as const};
  if(t!.invitationState!=="not_sent"||t!.authUserId)throw new PatientEnrollmentError("NOT_ELIGIBLE");
  if(!await r.claimInvitation(target))throw new PatientEnrollmentError("NOT_ELIGIBLE");
  let authId:string;
  try{authId=id((await provider.inviteUserByEmail(t!.email,redirect,target)).providerUserId)}
  catch(e){await r.markReconciliation(target);throw new PatientEnrollmentError("PERSISTENCE_ERROR")}
  try{
   await pool.withTransaction(async db=>{
    const repo=createPatientProvisioningRepository(db);
    if(!await repo.markSent(target,authId))throw new PatientEnrollmentError("NOT_ELIGIBLE");
    await createAuditEventRepository(db).insert({
     id:crypto.randomUUID(),actorUserId:actor.userId,actorAuthUserId:actor.authUserId,
     action:"PATIENT_PORTAL_INVITED",targetType:"PATIENT_ACCOUNT",targetId:target,branchId:null,
     outcome:"SUCCESS",metadata:{status:"pending"},occurredAt:new Date().toISOString(),requestId:actor.requestId
    });
   });
  }catch{
   await r.markReconciliation(target);
   throw new PatientEnrollmentError("PERSISTENCE_ERROR");
  }
  return {id:target,invitation:"sent" as const};
 },
 async activate(authUserId:string,email:string|null,emailConfirmed:boolean,requestId:string){
  const authId=id(authUserId),rid=id(requestId);
  if(emailConfirmed!==true||!email)throw new PatientEnrollmentError("IDENTITY_UNVERIFIED");
  const t=await createPatientProvisioningRepository(pool).getByAuthId(authId);
  if(!valid(t)||t!.authUserId!==authId||t!.invitationState!=="sent"||t!.email.toLowerCase()!==email.trim().toLowerCase())
   throw new PatientEnrollmentError("NOT_ELIGIBLE");
  await pool.withTransaction(async db=>{
   if(!await createPatientProvisioningRepository(db).activate(t!.id,authId,email.trim().toLowerCase()))throw new PatientEnrollmentError("NOT_ELIGIBLE");
   await createAuditEventRepository(db).insert({id:crypto.randomUUID(),actorUserId:t!.id,actorAuthUserId:authId,
    action:"PATIENT_PORTAL_ACTIVATED",targetType:"PATIENT_ACCOUNT",targetId:t!.id,branchId:null,
    outcome:"SUCCESS",metadata:{status:"active"},occurredAt:new Date().toISOString(),requestId:rid});
  });
  return {activated:true as const};
 }
 };
}
