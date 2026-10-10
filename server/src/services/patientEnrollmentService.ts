import crypto from "node:crypto";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import {createAuditEventRepository,type AuditEventRepository} from "../repositories/auditEventRepository.js";
import {createPatientEnrollmentRepository,type EnrollmentRepository} from "../repositories/patientEnrollmentRepository.js";
import {PatientEnrollmentError,toPatientEnrollmentError} from "./patientEnrollmentErrors.js";
import type {AuthorizationContext} from "./authorizationService.js";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EnrollmentInput {
 patientId:unknown;email:unknown;
 identityVerifiedInPerson:unknown;emailOwnershipConfirmed:unknown;patientConsentRecorded:unknown;
}
export interface EnrollmentActor {userId:string;authUserId:string;requestId:string;authorization:AuthorizationContext}
export interface EnrollmentDependencies {
 createRepository?:(executor:PgQueryExecutor)=>EnrollmentRepository;
 createAuditRepository?:(executor:PgQueryExecutor)=>AuditEventRepository;
 createId?:()=>string;now?:()=>Date;
}
function requireId(v:unknown):string {
 if(typeof v!=="string"||!uuid.test(v))throw new PatientEnrollmentError("INVALID_INPUT");
 return v.toLowerCase();
}
function normalizeEmail(v:unknown):string{
 if(typeof v!=="string"||v.length>254||!emailPattern.test(v.trim()))throw new PatientEnrollmentError("INVALID_INPUT");
 return v.trim().toLowerCase();
}
function isAdult(birthday:string,now:Date):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(birthday))return false;
 const date=new Date(birthday+"T00:00:00Z");if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==birthday)return false;
 const age=now.getUTCFullYear()-date.getUTCFullYear()-(now.toISOString().slice(5,10)<birthday.slice(5)?1:0);
 return age>=18&&age<130;
}
export function createPatientEnrollmentService(pool:PgPoolManager,options:EnrollmentDependencies={}){
 const repo=options.createRepository??createPatientEnrollmentRepository;
 const auditRepo=options.createAuditRepository??createAuditEventRepository;
 const newId=options.createId??(()=>crypto.randomUUID());
 const now=options.now??(()=>new Date());
 return {async createPending(input:EnrollmentInput,actor:EnrollmentActor){
  const patientId=requireId(input.patientId);
  const email=normalizeEmail(input.email);
  if(input.identityVerifiedInPerson!==true||input.emailOwnershipConfirmed!==true||input.patientConsentRecorded!==true)
   throw new PatientEnrollmentError("IDENTITY_UNVERIFIED");
  if(!actor.authorization||actor.authorization.userId!==actor.userId||actor.authorization.authUserId!==actor.authUserId||
   actor.authorization.status!=="active"||!actor.authorization.roles.some(r=>r==="PERSONNEL"||r==="DENTIST")||
   !actor.authorization.permissions.some(p=>p.code==="patient.read"&&p.scope==="BRANCH")||
   !actor.authorization.permissions.some(p=>p.code==="patient.create"&&p.scope==="BRANCH"))
   throw new PatientEnrollmentError("NOT_ELIGIBLE");
  const userId=requireId(newId()),at=now().toISOString();
  try{
   return await pool.withTransaction(async db=>{
    const r=repo(db);
    const patient=await r.getPatientForUpdate(patientId);
    if(!patient||!isAdult(patient.birthday,new Date(at))||!actor.authorization.branchIds.includes(patient.registrationBranchId))
     throw new PatientEnrollmentError("NOT_ELIGIBLE");
    if(!patient.email||patient.email.trim().toLowerCase()!==email)throw new PatientEnrollmentError("IDENTITY_UNVERIFIED");
    if(await r.hasPatientLink(patientId))throw new PatientEnrollmentError("ALREADY_LINKED");
    if(await r.hasEmail(email))throw new PatientEnrollmentError("EMAIL_CONFLICT");
    await r.createPendingUser(userId,email,[patient.firstName,patient.lastName].join(" ").trim());
    await r.assignPatientRole(userId);
    await r.createPendingLink(patientId,userId,actor.userId,at);
    await auditRepo(db).insert({
     id:requireId(newId()),actorUserId:actor.userId,actorAuthUserId:actor.authUserId,
     action:"PATIENT_PORTAL_LINK_APPROVED",targetType:"PATIENT_ACCOUNT",targetId:userId,
     branchId:patient.registrationBranchId,outcome:"SUCCESS",
     metadata:{identityVerifiedInPerson:true,emailOwnershipConfirmed:true,patientConsentRecorded:true,status:"pending"},
     occurredAt:at,requestId:actor.requestId
    });
    return {id:userId,status:"pending" as const};
   });
  }catch(e){throw toPatientEnrollmentError(e)}
 }};
}
