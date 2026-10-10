import assert from "node:assert/strict";
import test from "node:test";
import type {PgQueryExecutor,PgPoolManager} from "../postgres/pool.js";
import type {QueryResult,QueryResultRow} from "pg";
import {createPortalRecordsService} from "./portalRecordsService.js";
import {AuthorizationError} from "./authorizationErrors.js";
import type {AuthorizationContext} from "./authorizationService.js";

const patient="11111111-1111-4111-8111-111111111111";
const user="22222222-2222-4222-8222-222222222222";
const auth="33333333-3333-4333-8333-333333333333";
const branch="44444444-4444-4444-8444-444444444444";
const treatment="55555555-5555-4555-8555-555555555555";
const requestId="66666666-6666-4666-8666-666666666666";
function context(roles:AuthorizationContext["roles"],branchIds:string[]=[branch]):AuthorizationContext {
 return {userId:user,authUserId:auth,email:"fictional@example.test",displayName:"Fictional",status:"active",roles,branchIds,
 permissions:[{code:"treatment.publish",scope:"BRANCH"}]};
}
function database(onQuery:(sql:string,values?:readonly unknown[])=>void,otherBranch=false):PgPoolManager {
 const executor:PgQueryExecutor={async query<R extends QueryResultRow>(sql:string,values?:readonly unknown[]):Promise<QueryResult<R>>{
  onQuery(sql,values);
  const rows:Record<string,unknown>[]=sql.includes("FOR UPDATE OF t")?[{id:treatment,patient_id:patient,branch_id:otherBranch?"77777777-7777-4777-8777-777777777777":branch}]:[];
  return {rows:rows as R[],rowCount:sql.startsWith("UPDATE")||sql.startsWith("INSERT")?1:rows.length,oid:0,command:"SELECT",fields:[]};
 }};
 return {query:executor.query,withTransaction:async callback=>callback(executor),describeTarget:()=>({appEnv:"test",host:"localhost",port:5432,database:"fictional_test",username:"fiction",sslMode:"disable"}),isStarted:()=>true,shutdown:async()=>{}};
}
function denied(e:unknown){return e instanceof AuthorizationError&&e.code==="AUTHORIZATION_DENIED"}
test("only a Dentist on the treatment branch can publish, independent of registration branch",async()=>{
 const queries:string[]=[];
 const service=createPortalRecordsService(database(sql=>queries.push(sql)));
 await assert.rejects(service.publish(context(["PERSONNEL"]),requestId,treatment,"Safe summary"),denied);
 await assert.rejects(service.publish(context(["SYSTEM_ADMINISTRATOR"]),requestId,treatment,"Safe summary"),denied);
 assert.equal(queries.length,0);
 await assert.rejects(createPortalRecordsService(database(()=>{},true)).publish(context(["DENTIST"]),requestId,treatment,"Safe summary"),denied);
 const published=await service.publish(context(["DENTIST"]),requestId,treatment,"Care instructions");
 assert.deepEqual(published,{published:true});
 const ownershipQuery=queries.find(q=>q.includes("FOR UPDATE OF t"))??"";
 assert.match(ownershipQuery,/SELECT t\.id,t\.patient_id,t\.branch_id FROM treatments t/);
 assert.ok(!ownershipQuery.includes("JOIN patients"));
 assert.equal(queries.filter(q=>q.startsWith("UPDATE treatments")).length,1);
 assert.equal(queries.filter(q=>q.includes("INSERT INTO audit_events")).length,1);
});
test("publication rejects malformed IDs and overly long or empty summaries before touching SQL",async()=>{
 const queries:string[]=[];
 const service=createPortalRecordsService(database(sql=>queries.push(sql)));
 for(const summary of ["","  ","x".repeat(1001)]){
  await assert.rejects(service.publish(context(["DENTIST"]),requestId,treatment,summary),denied);
 }
 await assert.rejects(service.publish(context(["DENTIST"]),requestId,"not-a-uuid","Safe"),denied);
 assert.equal(queries.length,0);
});
