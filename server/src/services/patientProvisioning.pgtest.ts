import assert from "node:assert/strict";
import test from "node:test";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {QueryResult,QueryResultRow} from "pg";
import type {StaffProvisioningProvider} from "../staff/supabaseStaffProvisioningProvider.js";
import {createPatientProvisioningService} from "./patientProvisioningService.js";
import {PatientEnrollmentError} from "./patientEnrollmentErrors.js";
const user="11111111-1111-4111-8111-111111111111";
const actorId="22222222-2222-4222-8222-222222222222";
const actorAuth="33333333-3333-4333-8333-333333333333";
const auth="44444444-4444-4444-8444-444444444444";
const requestId="55555555-5555-4555-8555-555555555555";
function harness(mode:"initial"|"already_sent"|"mixed"|"pending"="initial"){
 const calls:string[]=[];
 let state=mode==="already_sent"?"sent":"not_sent";
 let authId:string|null=mode==="already_sent"?auth:null;
 const pool={
  async query<R extends QueryResultRow>(sql:string,params?:readonly unknown[]):Promise<QueryResult<R>>{
   let rows:Record<string,unknown>[]=[];let rowCount=0;
   if(sql.includes("SELECT u.id, u.email")){
    rows=[{id:user,email:"patient@example.test",auth_user_id:authId,patient_email:"patient@example.test",patient_branch_id:"66666666-6666-4666-8666-666666666666",approved_by_user_id:actorId,user_status:"pending",link_status:"pending",invitation_state:state}];
   }else if(sql.includes("SELECT u.id FROM app_users")){
    if(params?.[0]===authId)rows=[{id:user}];
   }else if(sql.includes("SELECT r.code FROM user_roles")){
    rows=mode==="mixed"?[{code:"PATIENT"},{code:"DENTIST"}]:[{code:"PATIENT"}];
   }else if(sql.includes("SELECT branch_id FROM user_branches"))rows=[];
   else if(sql.includes("SET invitation_state = 'sending'")){if(state==="not_sent"){state="sending";rowCount=1;calls.push("claimed")}}
   else if(sql.includes("UPDATE patient_accounts SET invitation_state='reconciliation_required'")){state="reconciliation_required";rowCount=1;calls.push("reconcile")}
   else if(sql.includes("UPDATE app_users SET auth_user_id") || sql.includes("UPDATE app_users SET auth_user_id =")){authId=params?.[1] as string;rowCount=1;calls.push("linked")}
   else if(sql.includes("UPDATE patient_accounts SET invitation_state = 'sent'")){state="sent";rowCount=1;calls.push("sent")}
   else if(sql.includes("UPDATE patient_accounts pa")){rowCount=1;calls.push("patient-active")}
   else if(sql.includes("UPDATE app_users SET status = 'active'")){rowCount=1;calls.push("user-active")}
   else if(sql.includes("INSERT INTO audit_events")){rowCount=1;calls.push("audit")}
   return {command:"",rowCount,oid:0,fields:[],rows:rows as R[]};
  },
  async withTransaction<T>(fn:(db:PgQueryExecutor)=>Promise<T>){return fn(this as PgQueryExecutor)},
  describeTarget(){return {appEnv:"test" as const,host:"localhost",port:5432,database:"fake_test",username:"test",sslMode:"disable" as const}},
  isStarted(){return true},async shutdown(){}
 } satisfies PgPoolManager;
 let invites=0;
 const provider:StaffProvisioningProvider={
  async inviteUserByEmail(){invites++;calls.push("invite");return {providerUserId:auth}},
  async deleteUser(){calls.push("cleanup");return true}
 };
 const service=createPatientProvisioningService(pool,provider,"http://localhost:5173/activate-patient-account");
 return {service,calls,get invites(){return invites}};
}
const by={userId:actorId,authUserId:actorAuth,requestId,authorization:{userId:actorId,authUserId:actorAuth,email:'operator@example.test',displayName:'Operator',status:'active' as const,roles:['PERSONNEL' as const],branchIds:['66666666-6666-4666-8666-666666666666'],permissions:[{code:'patient.read' as const,scope:'BRANCH' as const},{code:'patient.create' as const,scope:'BRANCH' as const}]}};
const failure=(code:string)=>(e:unknown)=>e instanceof PatientEnrollmentError&&e.code===code;
test("pending patient-only invitation links auth identity and audits",async()=>{
 const h=harness();const r=await h.service.invite(user,by);
 assert.deepEqual(r,{id:user,invitation:"sent"});
 assert.deepEqual(h.calls,["claimed","invite","linked","sent","audit"]);
});
test("previously invited is idempotent, no second message",async()=>{
 const h=harness("already_sent");
 assert.deepEqual(await h.service.invite(user,by),{id:user,invitation:"already_sent"});
 assert.equal(h.invites,0);
});
test("mixed staff/patient identity cannot be invited",async()=>{
 const h=harness("mixed");
 await assert.rejects(h.service.invite(user,by),failure("NOT_ELIGIBLE"));
 assert.equal(h.invites,0);
});
test("patient invitation denies a mismatched approving operator or unauthorized branch",async()=>{
 const h=harness();
 const wrongApprover={...by,userId:"77777777-7777-4777-8777-777777777777"};
 await assert.rejects(h.service.invite(user,wrongApprover),failure("NOT_ELIGIBLE"));
 const wrongBranch={...by,authorization:{...by.authorization,branchIds:[]}};
 await assert.rejects(h.service.invite(user,wrongBranch),failure("NOT_ELIGIBLE"));
 assert.equal(h.invites,0);
});
test("patient activation requires trusted confirmed email and linked auth subject",async()=>{
 const h=harness();
 await h.service.invite(user,by);
 await assert.rejects(h.service.activate(auth,"patient@example.test",false,requestId),failure("IDENTITY_UNVERIFIED"));
 await assert.rejects(h.service.activate(auth,"other@example.test",true,requestId),failure("NOT_ELIGIBLE"));
 assert.deepEqual(await h.service.activate(auth,"patient@example.test",true,requestId),{activated:true});
 assert.ok(h.calls.includes("patient-active")&&h.calls.includes("user-active")&&h.calls.includes("audit"));
});
