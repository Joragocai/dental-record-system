import crypto from "node:crypto";
import type {PgPoolManager} from "../postgres/pool.js";
import type {AuthorizationContext} from "./authorizationService.js";
import {AuthorizationError} from "./authorizationErrors.js";
import {createAuditEventRepository} from "../repositories/auditEventRepository.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createPortalDocumentPublicationService(pool:PgPoolManager){
 return {
  async setVisible(ctx:AuthorizationContext,requestId:string,rawId:unknown,input:unknown){
   if(typeof rawId!=="string"||!uuid.test(rawId)||
      !input||typeof input!=="object"||Array.isArray(input)||
      Object.keys(input).length!==1||typeof (input as {visible?:unknown}).visible!=="boolean")
     throw new AuthorizationError("AUTHORIZATION_DENIED");
   if(ctx.status!=="active"||!ctx.roles.includes("DENTIST")||
      !ctx.permissions.some(p=>p.code==="attachment.update"&&p.scope==="BRANCH"))
     throw new AuthorizationError("AUTHORIZATION_DENIED");
   const visible=(input as {visible:boolean}).visible;
   return pool.withTransaction(async db=>{
    const record=await db.query<{id:string;patient_id:string;branch_id:string}>(
     "SELECT id,patient_id,branch_id FROM attachments WHERE id=$1 AND status='uploaded' AND deleted_at IS NULL FOR UPDATE",[rawId]);
    const attachment=record.rows[0];
    if(!attachment||!ctx.branchIds.includes(attachment.branch_id))throw new AuthorizationError("AUTHORIZATION_DENIED");
    const result=await db.query("UPDATE attachments SET is_patient_visible=$2,updated_at=NOW() WHERE id=$1 AND status='uploaded' AND deleted_at IS NULL",[rawId,visible]);
    if(result.rowCount!==1)throw new AuthorizationError("AUTHORIZATION_DENIED");
    await createAuditEventRepository(db).insert({id:crypto.randomUUID(),actorUserId:ctx.userId,
     actorAuthUserId:ctx.authUserId,requestId,action:visible?"PATIENT_DOCUMENT_PUBLISHED":"PATIENT_DOCUMENT_HIDDEN",
     targetType:"ATTACHMENT",targetId:attachment.id,branchId:attachment.branch_id,outcome:"SUCCESS",
     metadata:{patientVisible:visible},occurredAt:new Date().toISOString()});
    return {id:attachment.id,patientVisible:visible};
   });
  }
 };
}
