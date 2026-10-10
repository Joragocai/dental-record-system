import crypto from "node:crypto";
import type {PgPoolManager} from "../postgres/pool.js";
import type {AuthorizationContext} from "./authorizationService.js";
import {createPatientOwnershipService} from "./patientOwnershipService.js";
import {createPatientAccountRepository} from "../repositories/patientAccountRepository.js";
import {createAuditEventRepository} from "../repositories/auditEventRepository.js";
import {AuthorizationError} from "./authorizationErrors.js";
export function createPortalAccountService(pool:PgPoolManager){
 return {
  async deactivate(context:AuthorizationContext,requestId:string){
   await createPatientOwnershipService(createPatientAccountRepository(pool)).requireOwnPatient(context,"portal.profile.read");
   return pool.withTransaction(async db=>{
    const result=await db.query<{patient_id:string}>(`UPDATE patient_accounts pa SET status='revoked',
      revoked_at=NOW(),updated_at=NOW()
      WHERE pa.app_user_id=$1 AND pa.status='active'
        AND EXISTS (SELECT 1 FROM app_users u WHERE u.id=$1 AND u.auth_user_id=$2 AND u.status='active')
      RETURNING patient_id`,[context.userId,context.authUserId]);
    if(result.rowCount!==1)throw new AuthorizationError("AUTHORIZATION_DENIED");
    const user=await db.query("UPDATE app_users SET status='deactivated',updated_at=NOW() WHERE id=$1 AND auth_user_id=$2 AND status='active'",
     [context.userId,context.authUserId]);
    if(user.rowCount!==1)throw new AuthorizationError("AUTHORIZATION_DENIED");
    await createAuditEventRepository(db).insert({
     id:crypto.randomUUID(),actorUserId:context.userId,actorAuthUserId:context.authUserId,requestId,
     action:"PATIENT_PORTAL_DEACTIVATED",targetType:"PATIENT_ACCOUNT",targetId:context.userId,
     branchId:null,outcome:"SUCCESS",metadata:{retainsClinicalRecords:true},occurredAt:new Date().toISOString()
    });
    return {deactivated:true};
   });
  }
 };
}
