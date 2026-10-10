import assert from "node:assert/strict";
import test from "node:test";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {EnrollmentPatient,EnrollmentRepository} from "../repositories/patientEnrollmentRepository.js";
import type {AuditEventRepository,AuditEventRecord} from "../repositories/auditEventRepository.js";
import type {AuthorizationContext} from "./authorizationService.js";
import {PatientEnrollmentError} from "./patientEnrollmentErrors.js";
import {createPatientEnrollmentService} from "./patientEnrollmentService.js";

const user="11111111-1111-4111-8111-111111111111";
const auth="22222222-2222-4222-8222-222222222222";
const branch="33333333-3333-4333-8333-333333333333";
const patientId="44444444-4444-4444-8444-444444444444";
const accountId="55555555-5555-4555-8555-555555555555";
const auditId="66666666-6666-4666-8666-666666666666";
const requestId="77777777-7777-4777-8777-777777777777";
const fakePatient:EnrollmentPatient={
 id:patientId,birthday:"1990-04-10",email:"patient@example.test",
 firstName:"Fictional",lastName:"Patient",registrationBranchId:branch
};
function context():AuthorizationContext{return{
 userId:user,authUserId:auth,email:"staff@example.test",displayName:"Test Staff",
 status:"active",roles:["PERSONNEL"],branchIds:[branch],
 permissions:[{code:"patient.read",scope:"BRANCH"},{code:"patient.create",scope:"BRANCH"}]
}}
function input(){return {patientId,email:"patient@example.test",identityVerifiedInPerson:true,emailOwnershipConfirmed:true,patientConsentRecorded:true}}
function actor(){return {userId:user,authUserId:auth,requestId,authorization:context()}}
function harness(options:{patient?:EnrollmentPatient|null;linked?:boolean;taken?:boolean;failAudit?:boolean}={}){
 const calls:string[]=[];const events:AuditEventRecord[]=[];
 const repo:EnrollmentRepository={
  async getPatientForUpdate(){calls.push("lock-patient");return options.patient===undefined?fakePatient:options.patient},
  async hasPatientLink(){calls.push("link-check");return options.linked??false},
  async hasEmail(){calls.push("email-check");return options.taken??false},
  async createPendingUser(){calls.push("user")},
  async assignPatientRole(){calls.push("role")},
  async createPendingLink(){calls.push("link")}
 };
 const auditRepo:AuditEventRepository={async insert(event){if(options.failAudit)throw new Error("audit error");events.push(event);calls.push("audit")}};
 const pool={async withTransaction<T>(fn:(executor:PgQueryExecutor)=>Promise<T>):Promise<T>{calls.push("begin");const r=await fn({query:async()=>{throw Error("unexpected SQL")} } as unknown as PgQueryExecutor);calls.push("commit");return r}} as PgPoolManager;
 const svc=createPatientEnrollmentService(pool,{createRepository:()=>repo,createAuditRepository:()=>auditRepo,
  createId:(()=>{let n=0;return()=>++n===1?accountId:auditId})(),now:()=>new Date("2026-10-10T09:00:00.000Z")});
 return {svc,calls,events};
}
function expect(code:PatientEnrollmentError["code"]){return(e:unknown)=>e instanceof PatientEnrollmentError&&e.code===code}

test("verified adult patient creates pending link and correlated audit in one transaction",async()=>{
 const h=harness();const r=await h.svc.createPending(input(),actor());
 assert.deepEqual(r,{id:accountId,status:"pending"});
 assert.deepEqual(h.calls,["begin","lock-patient","link-check","email-check","user","role","link","audit","commit"]);
 assert.equal(h.events[0]?.action,"PATIENT_PORTAL_LINK_APPROVED");
 assert.equal(h.events[0]?.requestId,requestId);
 assert.equal(h.events[0]?.targetId,accountId);
 assert.equal(JSON.stringify(h.events[0]).includes("patient@example.test"),false);
});
test("missing verified identity, contact ownership or consent denies before writes",async()=>{
 for(const field of ["identityVerifiedInPerson","emailOwnershipConfirmed","patientConsentRecorded"] as const){
  const h=harness();await assert.rejects(h.svc.createPending({...input(),[field]:false},actor()),expect("IDENTITY_UNVERIFIED"));
  assert.deepEqual(h.calls,[]);
 }
});
test("staff lacks permission, is technical, or is outside registration branch",async()=>{
 for(const edit of [(a:ReturnType<typeof actor>)=>a.authorization.permissions=[],
  (a:ReturnType<typeof actor>)=>a.authorization.roles=["SYSTEM_ADMINISTRATOR"],
  (a:ReturnType<typeof actor>)=>a.authorization.branchIds=[]]){
  const h=harness();const a=actor();edit(a);await assert.rejects(h.svc.createPending(input(),a),expect("NOT_ELIGIBLE"));
 }
});
test("duplicate link, conflicting email, unverified matching record, underage or missing patient deny",async()=>{
 const cases:[Parameters<typeof harness>[0],PatientEnrollmentError["code"]][]=[
  [{linked:true},"ALREADY_LINKED"],[{taken:true},"EMAIL_CONFLICT"],
  [{patient:{...fakePatient,email:"other@example.test"}},"IDENTITY_UNVERIFIED"],
  [{patient:{...fakePatient,birthday:"2019-10-10"}},"NOT_ELIGIBLE"],
  [{patient:null},"NOT_ELIGIBLE"]
 ];
 for(const [opts,code]of cases){
  const h=harness(opts);await assert.rejects(h.svc.createPending(input(),actor()),expect(code));
  assert.equal(h.calls.includes("user"),false);
 }
});
test("audit failure rejects entire transaction without returning pending approval",async()=>{
 const h=harness({failAudit:true});
 await assert.rejects(h.svc.createPending(input(),actor()),expect("PERSISTENCE_ERROR"));
 assert.equal(h.calls.includes("commit"),false);
});
