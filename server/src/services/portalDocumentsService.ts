import crypto from "node:crypto";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {AuthorizationContext} from "./authorizationService.js";
import type {AttachmentStorageAdapter} from "../attachments/attachmentStorageAdapter.js";
import {createPatientAccountRepository} from "../repositories/patientAccountRepository.js";
import {createPatientOwnershipService} from "./patientOwnershipService.js";
import {createAuditEventRepository} from "../repositories/auditEventRepository.js";
import {AuthorizationError} from "./authorizationErrors.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface PortalDocument {id:string;filename:string;category:string;description:string|null;mimeType:string;sizeBytes:number;uploadedAt:string}
interface PortalStorageRow extends PortalDocument {object_key:string}
export interface PortalDocumentsRepository{
 list(patientId:string):Promise<PortalDocument[]>;
 document(patientId:string,id:string):Promise<PortalStorageRow|null>;
}
export function createPortalDocumentsRepository(db:PgQueryExecutor):PortalDocumentsRepository{
 return {
  async list(patientId){
   const result=await db.query<{id:string;original_filename:string;category:string;description:string|null;mime_type:string;size_bytes:string|number;uploaded_at:string|Date}>(
    `SELECT id,original_filename,category,description,mime_type,size_bytes,uploaded_at
     FROM attachments WHERE patient_id=$1 AND is_patient_visible=TRUE
       AND status='uploaded' AND deleted_at IS NULL AND uploaded_at IS NOT NULL
     ORDER BY uploaded_at DESC,id DESC LIMIT 100`,[patientId]);
   return result.rows.map(r=>({id:r.id,filename:r.original_filename,category:r.category,description:r.description,
    mimeType:r.mime_type,sizeBytes:Number(r.size_bytes),uploadedAt:r.uploaded_at instanceof Date?r.uploaded_at.toISOString():r.uploaded_at}));
  },
  async document(patientId,id){
   const result=await db.query<{id:string;original_filename:string;category:string;description:string|null;mime_type:string;size_bytes:string|number;uploaded_at:string|Date;object_key:string}>(
    `SELECT id,original_filename,category,description,mime_type,size_bytes,uploaded_at,object_key
     FROM attachments WHERE patient_id=$1 AND id=$2 AND is_patient_visible=TRUE
       AND status='uploaded' AND deleted_at IS NULL AND uploaded_at IS NOT NULL
     FOR UPDATE`,[patientId,id]);
   const r=result.rows[0];return r?{id:r.id,filename:r.original_filename,category:r.category,description:r.description,
    mimeType:r.mime_type,sizeBytes:Number(r.size_bytes),uploadedAt:r.uploaded_at instanceof Date?r.uploaded_at.toISOString():r.uploaded_at,object_key:r.object_key}:null;
  }
 }
}
export function createPortalDocumentsService(pool:PgPoolManager,storage:AttachmentStorageAdapter,
 repositoryFactory:(db:PgQueryExecutor)=>PortalDocumentsRepository=createPortalDocumentsRepository){
 async function owned(context:AuthorizationContext){
  return createPatientOwnershipService(createPatientAccountRepository(pool)).requireOwnPatient(context,"portal.documents.read");
 }
 return {
  async list(context:AuthorizationContext,requestId:string){
   const patientId=await owned(context);
   return pool.withTransaction(async db=>{
    const documents=await repositoryFactory(db).list(patientId);
    await createAuditEventRepository(db).insert({id:crypto.randomUUID(),actorUserId:context.userId,
     actorAuthUserId:context.authUserId,requestId,action:"PATIENT_DOCUMENTS_LISTED",targetType:"PATIENT",
     targetId:patientId,branchId:null,outcome:"SUCCESS",metadata:{count:documents.length},occurredAt:new Date().toISOString()});
    return documents;
   });
  },
  async download(context:AuthorizationContext,requestId:string,rawId:unknown){
   const patientId=await owned(context);
   if(typeof rawId!=="string"||!uuid.test(rawId))throw new AuthorizationError("AUTHORIZATION_DENIED");
   return pool.withTransaction(async db=>{
    const active=await db.query(`SELECT pa.patient_id FROM patient_accounts pa
      JOIN app_users u ON u.id=pa.app_user_id
      WHERE pa.app_user_id=$1 AND pa.patient_id=$2 AND pa.status='active'
        AND u.auth_user_id=$3 AND u.status='active'
      FOR UPDATE OF pa`,[context.userId,patientId,context.authUserId]);
    if(active.rowCount!==1)throw new AuthorizationError("AUTHORIZATION_DENIED");
    const document=await repositoryFactory(db).document(patientId,rawId);
    if(!document)throw new AuthorizationError("AUTHORIZATION_DENIED");
    // Fresh link is issued only while a verified, uploaded, visible record is locked.
    // Keeping storage issuance inside the transaction prevents a concurrent hide/delete
    // from making a fresh signed link appear after authorization was revoked.
    const signed=await storage.createSignedDownload(document.object_key,document.filename);
    await createAuditEventRepository(db).insert({id:crypto.randomUUID(),actorUserId:context.userId,
     actorAuthUserId:context.authUserId,requestId,action:"PATIENT_DOCUMENT_DOWNLOAD_AUTHORIZED",
     targetType:"ATTACHMENT",targetId:document.id,branchId:null,outcome:"SUCCESS",
     metadata:{portal:true},occurredAt:new Date().toISOString()});
    return {signedUrl:signed.signedUrl,expiresInSeconds:signed.expiresInSeconds};
   });
  }
 };
}
