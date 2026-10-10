import crypto from "node:crypto";
import type {PgPoolManager} from "../postgres/pool.js";
import type {AuthorizationContext} from "./authorizationService.js";
import {createPatientOwnershipService,type PortalOwnPermission} from "./patientOwnershipService.js";
import {createPatientAccountRepository} from "../repositories/patientAccountRepository.js";
import {createPortalRecordsRepository} from "../repositories/portalRecordsRepository.js";
import {createAuditEventRepository} from "../repositories/auditEventRepository.js";
import {AuthorizationError} from "./authorizationErrors.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createPortalRecordsService(pool:PgPoolManager){
 async function owned(context:AuthorizationContext,permission:PortalOwnPermission){
  return createPatientOwnershipService(createPatientAccountRepository(pool)).requireOwnPatient(context,permission);
 }
 function audit(db:Parameters<Parameters<PgPoolManager["withTransaction"]>[0]>[0],context:AuthorizationContext,requestId:string,action:string,patientId:string){
  return createAuditEventRepository(db).insert({id:crypto.randomUUID(),actorUserId:context.userId,actorAuthUserId:context.authUserId,
   targetId:patientId,targetType:"PATIENT",branchId:null,action,outcome:"SUCCESS",metadata:{portal:true},occurredAt:new Date().toISOString(),requestId});
 }
 return {
  async profile(context:AuthorizationContext,requestId:string){
   const id=await owned(context,"portal.profile.read");
   return pool.withTransaction(async db=>{
    const value=await createPortalRecordsRepository(db).profile(id);
    if(!value)throw new AuthorizationError("AUTHORIZATION_DENIED");
    await audit(db,context,requestId,"PORTAL_PROFILE_VIEWED",id);return value;
   });
  },
  async updateContact(context:AuthorizationContext,requestId:string,input:unknown){
   const id=await owned(context,"portal.profile.update");
   if(!input||typeof input!=="object"||Array.isArray(input))throw new AuthorizationError("AUTHORIZATION_DENIED");
   const o=input as Record<string,unknown>;
   if(Object.keys(o).some(key=>!["mobileNumber","homeAddress"].includes(key))||
      typeof o.mobileNumber!=="string"||!/^[0-9+() -]{7,25}$/.test(o.mobileNumber)||
      !(o.homeAddress===null||(typeof o.homeAddress==="string"&&o.homeAddress.length<=255)))throw new AuthorizationError("AUTHORIZATION_DENIED");
   return pool.withTransaction(async db=>{
    const repo=createPortalRecordsRepository(db);
    if(!await repo.updateContact(id,o.mobileNumber as string,o.homeAddress as string|null))throw new AuthorizationError("AUTHORIZATION_DENIED");
    await audit(db,context,requestId,"PORTAL_CONTACT_UPDATED",id);return repo.profile(id);
   });
  },
  async treatments(context:AuthorizationContext,requestId:string){
   const id=await owned(context,"portal.treatments.read");
   return pool.withTransaction(async db=>{
    const items=await createPortalRecordsRepository(db).treatments(id);
    await audit(db,context,requestId,"PORTAL_TREATMENTS_VIEWED",id);return items;
   });
  },
  async appointments(context:AuthorizationContext,requestId:string){
   const id=await owned(context,"portal.appointments.read");
   return pool.withTransaction(async db=>{
    const items=await createPortalRecordsRepository(db).appointments(id);
    await audit(db,context,requestId,"PORTAL_APPOINTMENTS_VIEWED",id);return items;
   });
  },
  async publish(context:AuthorizationContext,requestId:string,treatmentId:unknown,summary:unknown){
   if(typeof treatmentId!=="string"||!uuid.test(treatmentId)||typeof summary!=="string"||summary.trim().length<1||summary.trim().length>1000||
     context.status!=="active"||!context.roles.includes("DENTIST")||
     !context.permissions.some(x=>x.code==="treatment.publish"&&x.scope==="BRANCH"))
     throw new AuthorizationError("AUTHORIZATION_DENIED");
   return pool.withTransaction(async db=>{
    const repo=createPortalRecordsRepository(db);
    const treatment=await repo.treatmentForUpdate(treatmentId);
    if(!treatment||!context.branchIds.includes(treatment.branch_id))throw new AuthorizationError("AUTHORIZATION_DENIED");
    if(!await repo.publish(treatmentId,summary.trim(),context.userId))throw new AuthorizationError("AUTHORIZATION_DENIED");
    await createAuditEventRepository(db).insert({
     id:crypto.randomUUID(),actorUserId:context.userId,actorAuthUserId:context.authUserId,
     requestId,action:"TREATMENT_PORTAL_PUBLISHED",targetType:"TREATMENT",
     targetId:treatment.id,branchId:treatment.branch_id,outcome:"SUCCESS",
     metadata:{patientVisible:true},occurredAt:new Date().toISOString()
    });
    return {published:true};
   });
  }
 };
}
