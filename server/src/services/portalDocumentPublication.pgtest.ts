import assert from "node:assert/strict";
import test from "node:test";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {QueryResult,QueryResultRow} from "pg";
import type {AuthorizationContext} from "./authorizationService.js";
import {createPortalDocumentPublicationService} from "./portalDocumentPublicationService.js";
import {AuthorizationError} from "./authorizationErrors.js";
const uid="11111111-1111-4111-8111-111111111111";
const authid="22222222-2222-4222-8222-222222222222";
const branch="33333333-3333-4333-8333-333333333333";
const attachment="44444444-4444-4444-8444-444444444444";
const rid="55555555-5555-4555-8555-555555555555";
function context(role:"DENTIST"|"PERSONNEL"="DENTIST",branches=[branch]):AuthorizationContext{
 return {userId:uid,authUserId:authid,email:"fictional@example.test",displayName:"Fictional",
  status:"active",roles:[role],branchIds:branches,permissions:[{code:"attachment.update",scope:"BRANCH"}]};
}
function fixture(){
 const statements:string[]=[];
 const executor:PgQueryExecutor={async query<R extends QueryResultRow>(sql:string):Promise<QueryResult<R>>{
  statements.push(sql);
  const rows:Record<string,unknown>[]=sql.startsWith("SELECT id,patient_id")?[{id:attachment,patient_id:"66666666-6666-4666-8666-666666666666",branch_id:branch}]:[];
  return {rows:rows as R[],rowCount:sql.startsWith("UPDATE")||sql.startsWith("INSERT")?1:rows.length,fields:[],oid:0,command:""};
 }};
 const pool:PgPoolManager={query:executor.query,withTransaction:async fn=>fn(executor),
  describeTarget:()=>({appEnv:"test",host:"localhost",port:5432,database:"fictional_test",username:"test",sslMode:"disable"}),
  isStarted:()=>true,shutdown:async()=>{}};
 return {service:createPortalDocumentPublicationService(pool),statements};
}
test("Dentist publishes or hides existing uploaded file and audits the decision",async()=>{
 const h=fixture();assert.deepEqual(await h.service.setVisible(context(),rid,attachment,{visible:true}),
  {id:attachment,patientVisible:true});
 assert.ok(h.statements.some(s=>s.includes("FOR UPDATE")));
 assert.ok(h.statements.some(s=>s.includes("UPDATE attachments")));
 assert.ok(h.statements.some(s=>s.includes("INSERT INTO audit_events")));
});
test("Personnel, out-of-branch, and malformed visibility requests never update a file",async()=>{
 for(const [who,input]of [[context("PERSONNEL"),{visible:true}],[context("DENTIST",[]),{visible:true}],[context(),{visible:"true"}],[context(),{visible:true,patientId:uid}]] as const){
  const h=fixture();await assert.rejects(h.service.setVisible(who,rid,attachment,input),AuthorizationError);
  assert.ok(!h.statements.some(s=>s.startsWith("UPDATE attachments")));
 }
});
