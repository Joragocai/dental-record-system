import assert from "node:assert/strict";
import test from "node:test";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {QueryResult,QueryResultRow} from "pg";
import type {AuthorizationContext} from "./authorizationService.js";
import type {AttachmentStorageAdapter} from "../attachments/attachmentStorageAdapter.js";
import {createPortalDocumentsService,createPortalDocumentsRepository} from "./portalDocumentsService.js";
import {createPortalAccountService} from "./portalAccountService.js";
import {AuthorizationError} from "./authorizationErrors.js";
const user="11111111-1111-4111-8111-111111111111";
const auth="22222222-2222-4222-8222-222222222222";
const patient="33333333-3333-4333-8333-333333333333";
const attachment="44444444-4444-4444-8444-444444444444";
const rid="55555555-5555-4555-8555-555555555555";
function context(role:"PATIENT"|"DENTIST"="PATIENT"):AuthorizationContext{
 return {userId:user,authUserId:auth,status:"active",displayName:"Fictional",email:"a@example.test",
 roles:[role],branchIds:[],permissions:[{code:"portal.documents.read",scope:"OWN"},{code:"portal.profile.read",scope:"OWN"}]};
}
function harness(options:{linked?:boolean;visible?:boolean;failAudit?:boolean}={}){
 const queries:string[]=[];let signed=0;
 const db:PgQueryExecutor={async query<R extends QueryResultRow>(sql:string):Promise<QueryResult<R>>{
  queries.push(sql);let rows:Record<string,unknown>[]=[];let count=0;
  if(sql.includes("SELECT app_user_id, patient_id, status FROM patient_accounts")){
   rows=options.linked===false?[]:[{app_user_id:user,patient_id:patient,status:"active"}];
  }else if(sql.includes("FOR UPDATE OF pa")){
   rows=options.linked===false?[]:[{patient_id:patient}];
  }else if(sql.includes("FROM attachments")){
   if(options.visible!==false)rows=[{id:attachment,original_filename:"Test.pdf",category:"Document",
    description:null,mime_type:"application/pdf",size_bytes:100,uploaded_at:"2026-10-10T00:00:00Z",
    object_key:"attachments/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444.pdf"}];
  }else if(sql.includes("INSERT INTO audit_events")){
   if(options.failAudit)throw Error("audit failed");
   count=1;
  }else if(sql.includes("UPDATE patient_accounts")){
   count=options.linked===false?0:1;
   rows=count?[{patient_id:patient}]:[];
  }else if(sql.includes("UPDATE app_users")){
   count=1;
  }
  return {rows:rows as R[],rowCount:count||rows.length,fields:[],command:"",oid:0};
 }};
 const pool:PgPoolManager={query:db.query,withTransaction:async fn=>fn(db),
  describeTarget:()=>({appEnv:"test",host:"localhost",port:5432,database:"fictional_test",username:"test",sslMode:"disable"}),
  isStarted:()=>true,shutdown:async()=>{}};
 const storage:AttachmentStorageAdapter={
  async createSignedDownload(){signed++;return{signedUrl:"https://private.example.test/signed",expiresInSeconds:120}},
  async createSignedUpload(){throw Error("not permitted")},async deleteObject(){throw Error("not permitted")},
  async readObject(){throw Error("not permitted")},async ensurePrivateBucket(){throw Error("not permitted")}
 };
 return {pool,db,storage,queries,get signed(){return signed}};
}
const denied=(e:unknown)=>e instanceof AuthorizationError;
test("patient document listing returns safe metadata only with patient and visibility filters",async()=>{
 const h=harness();const service=createPortalDocumentsService(h.pool,h.storage);
 const documents=await service.list(context(),rid);
 assert.equal(documents.length,1);
 assert.equal("object_key" in documents[0],false);
 const query=h.queries.find(q=>q.includes("FROM attachments"));
 assert.match(query??"",/patient_id=\$1/);
 assert.match(query??"",/is_patient_visible=TRUE/);
 assert.match(query??"",/status='uploaded'/);
 assert.match(query??"",/deleted_at IS NULL/);
});
test("only approved owned document gets fresh signed URL, with active account locked",async()=>{
 const h=harness();const response=await createPortalDocumentsService(h.pool,h.storage).download(context(),rid,attachment);
 assert.equal(response.expiresInSeconds,120);
 assert.equal(h.signed,1);
 assert.ok(h.queries.some(q=>q.includes("FOR UPDATE OF pa")));
 assert.ok(h.queries.some(q=>q.includes("FOR UPDATE")));
 assert.ok(h.queries.some(q=>q.includes("INSERT INTO audit_events")));
});
test("wrong role, unlinked account, hidden record and invalid identifier never get signed access",async()=>{
 for(const opts of [{linked:false},{visible:false}]){
  const h=harness(opts);await assert.rejects(createPortalDocumentsService(h.pool,h.storage).download(context(),rid,attachment),denied);
  assert.equal(h.signed,0);
 }
 const role=harness();await assert.rejects(createPortalDocumentsService(role.pool,role.storage).download(context("DENTIST"),rid,attachment),denied);
 const invalid=harness();await assert.rejects(createPortalDocumentsService(invalid.pool,invalid.storage).download(context(),rid,"invalid"),denied);
 assert.equal(invalid.signed,0);
});
test("self-deactivation updates portal link and app user together with append-only audit",async()=>{
 const h=harness();const response=await createPortalAccountService(h.pool).deactivate(context(),rid);
 assert.deepEqual(response,{deactivated:true});
 assert.ok(h.queries.some(q=>q.includes("UPDATE patient_accounts")));
 assert.ok(h.queries.some(q=>q.includes("UPDATE app_users")));
 assert.ok(h.queries.some(q=>q.includes("PATIENT_PORTAL_DEACTIVATED")===false&&q.includes("INSERT INTO audit_events")));
 assert.equal(h.queries.some(q=>q.includes("DELETE FROM")),false);
});
test("unlinked or mixed-role account cannot deactivate, and audit failure prevents success",async()=>{
 const unlinked=harness({linked:false});
 await assert.rejects(createPortalAccountService(unlinked.pool).deactivate(context(),rid),denied);
 const mixed=harness();await assert.rejects(createPortalAccountService(mixed.pool).deactivate(context("DENTIST"),rid),denied);
 const failed=harness({failAudit:true});
 await assert.rejects(createPortalAccountService(failed.pool).deactivate(context(),rid));
});
