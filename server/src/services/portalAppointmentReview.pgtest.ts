import assert from "node:assert/strict";
import test from "node:test";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {QueryResult,QueryResultRow} from "pg";
import type {AuthorizationContext} from "./authorizationService.js";
import {createPortalAppointmentReviewService} from "./portalAppointmentReviewService.js";
import {AuthorizationError} from "./authorizationErrors.js";
const user="11111111-1111-4111-8111-111111111111";
const auth="22222222-2222-4222-8222-222222222222";
const patient="33333333-3333-4333-8333-333333333333";
const appointment="44444444-4444-4444-8444-444444444444";
const branch="55555555-5555-4555-8555-555555555555";
const rid="66666666-6666-4666-8666-666666666666";
const correlation="77777777-7777-4777-8777-777777777777";
function ctx(role:"PERSONNEL"|"DENTIST"|"SYSTEM_ADMINISTRATOR"="PERSONNEL",branchIds=[branch]):AuthorizationContext{
 return {userId:user,authUserId:auth,email:"clinician@example.test",displayName:"Clinician",status:"active",roles:[role],branchIds,
 permissions:[{code:"appointment.cancel",scope:"BRANCH"},{code:"appointment.reschedule",scope:"BRANCH"}]};
}
function fixture(kind:"cancel"|"reschedule"="cancel",successfulApproval=false){
 const queries:string[]=[];let marked=0;let audit=0;
 const db:PgQueryExecutor={async query<R extends QueryResultRow>(sql:string):Promise<QueryResult<R>>{
  queries.push(sql);
  let rows:Record<string,unknown>[]=[];
  if(sql.includes("FROM patient_appointment_requests pr JOIN appointments a")){
   rows=[{id:rid,appointment_id:appointment,request_type:kind,status:"pending",reason:null,requested_branch_id:branch,requested_date:"2099-06-03",requested_time:"11:00:00",patient_id:patient,actual_patient_id:patient,branch_id:branch}];
  }
  if(sql.startsWith("UPDATE patient_appointment_requests"))marked++;
  if(sql.includes("INSERT INTO audit_events"))audit++;
  return {rows:rows as R[],rowCount:sql.startsWith("UPDATE")||sql.startsWith("INSERT")?1:rows.length,fields:[],oid:0,command:"SELECT"};
 }};
 const pool:PgPoolManager={query:db.query,withTransaction:async fn=>fn(db),describeTarget:()=>({appEnv:"test",host:"localhost",port:5432,database:"fictional_test",username:"test",sslMode:"disable"}),isStarted:()=>true,shutdown:async()=>{}};
 const decisions:string[]=[];
 const mockAppointment={id:appointment,patientId:patient,branchId:branch,dentistUserId:null,
  appointmentDate:"2099-06-03",appointmentTime:"11:00",durationMinutes:null,plannedProcedure:null,
  notes:null,status:"cancelled_by_clinic" as const,rescheduledFromAppointmentId:null,
  createdAt:"2026-10-10T00:00:00Z",updatedAt:"2026-10-10T00:00:00Z"};
 const factory=successfulApproval?()=>({
  async cancelAppointment(){decisions.push("cancel");return mockAppointment},
  async rescheduleAppointment(){decisions.push("reschedule");return {...mockAppointment,status:"confirmed" as const}}
 }):undefined;
 return {service:createPortalAppointmentReviewService(pool,factory),queries,decisions,get marked(){return marked},get audit(){return audit}};
}
test("authorized clinical staff may reject a request without changing appointments",async()=>{
 const f=fixture();const result=await f.service.decide(ctx(),correlation,rid,{decision:"rejected"});
 assert.deepEqual(result,{id:rid,status:"rejected"});
 assert.equal(f.marked,1);assert.equal(f.audit,1);
 assert.equal(f.queries.some(q=>q.startsWith("UPDATE appointments")),false);
});
test("technical-only user and staff outside branch cannot approve or reject",async()=>{
 for(const context of [ctx("SYSTEM_ADMINISTRATOR"),ctx("PERSONNEL",[])]){
  const f=fixture();
  await assert.rejects(f.service.decide(context,correlation,rid,{decision:"rejected"}),AuthorizationError);
  assert.equal(f.marked,0);
 }
});
test("failed Phase 12 approval does not mark request approved",async()=>{
 const f=fixture();
 await assert.rejects(f.service.decide(ctx(),correlation,rid,{decision:"approved"}));
 assert.equal(f.marked,0);assert.equal(f.audit,0);
});
test("approved cancellation applies clinic workflow before marking reviewed",async()=>{
 const f=fixture("cancel",true);
 assert.deepEqual(await f.service.decide(ctx(),correlation,rid,{decision:"approved"}),{id:rid,status:"approved"});
 assert.deepEqual(f.decisions,["cancel"]);assert.equal(f.marked,1);assert.equal(f.audit,1);
});
test("approved rescheduling supplies the clinician-selected slot through Phase 12",async()=>{
 const f=fixture("reschedule",true);
 const result=await f.service.decide(ctx(),correlation,rid,{decision:"approved",dentistUserId:user,durationMinutes:30,appointmentTime:"11:00"});
 assert.equal(result.status,"approved");assert.deepEqual(f.decisions,["reschedule"]);
 assert.equal(f.marked,1);assert.equal(f.audit,1);
});
test("invalid clinic review input does not write",async()=>{
 const f=fixture();
 await assert.rejects(f.service.decide(ctx(),correlation,rid,{decision:"approved",status:"confirmed"}));
 assert.equal(f.marked,0);
});
