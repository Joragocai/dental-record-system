import assert from "node:assert/strict";
import test from "node:test";
import type {PgPoolManager,PgQueryExecutor} from "../postgres/pool.js";
import type {QueryResult,QueryResultRow} from "pg";
import type {AuthorizationContext} from "./authorizationService.js";
import {createPortalAppointmentService} from "./portalAppointmentService.js";
import {AuthorizationError} from "./authorizationErrors.js";

const user="11111111-1111-4111-8111-111111111111";
const auth="22222222-2222-4222-8222-222222222222";
const patient="33333333-3333-4333-8333-333333333333";
const appointment="44444444-4444-4444-8444-444444444444";
const branch="55555555-5555-4555-8555-555555555555";
const key="66666666-6666-4666-8666-666666666666";
const correlation="77777777-7777-4777-8777-777777777777";
function context(id=user):AuthorizationContext{
 return {userId:id,authUserId:auth,email:"fictional@example.test",displayName:"Fictional Patient",status:"active",
  roles:["PATIENT"],branchIds:[],permissions:[{code:"portal.appointments.request",scope:"OWN"}]};
}
function fixture(options:{owned?:boolean; status?:string; existing?:boolean}={}){
 const sqls:string[]=[];const calls:{sql:string;params?:readonly unknown[]}[]=[];
 let recorded=0;
 const db:PgQueryExecutor={async query<R extends QueryResultRow>(sql:string,params?:readonly unknown[]):Promise<QueryResult<R>>{
  sqls.push(sql);calls.push({sql,params});
  let rows:Record<string,unknown>[]=[];
  if(sql.startsWith("SELECT app_user_id"))rows=options.owned===false?[]:[{app_user_id:user,patient_id:patient,status:"active"}];
  if(sql.includes("FROM appointments WHERE id=$1 AND patient_id=$2"))rows=options.owned===false?[]:[{id:appointment,status:options.status??"confirmed"}];
  if(sql.startsWith("SELECT 1 FROM branches"))rows=[{present:1}];
  if(sql.startsWith("SELECT appointment_id,request_fingerprint")&&options.existing)rows=[{appointment_id:appointment,request_fingerprint:"incorrect-hash"}];
  if(sql.startsWith("INSERT INTO appointments"))recorded++;
  return {rows:rows as R[],rowCount:sql.startsWith("INSERT")?1:rows.length,command:"SELECT",oid:0,fields:[]};
 }};
 const pool:PgPoolManager={query:db.query,withTransaction:async fn=>fn(db),describeTarget:()=>({appEnv:"test",host:"localhost",port:5432,database:"portal_test",username:"test",sslMode:"disable"}),isStarted:()=>true,shutdown:async()=>{}};
 return {service:createPortalAppointmentService(pool),sqls,calls,get recorded(){return recorded}};
}
test("new appointment is requested, never confirmed or slot-reserving",async()=>{
 const f=fixture();
 const result=await f.service.create(context(),correlation,{branchId:branch,appointmentDate:"2099-05-20",appointmentTime:null,plannedProcedure:"Cleaning",idempotencyKey:key});
 assert.equal(result.status,"requested");
 assert.equal(f.recorded,1);
 const inserted=f.calls.find(x=>x.sql.startsWith("INSERT INTO appointments"));
 assert.ok(inserted?.sql.includes("'requested',NULL,NULL,NULL"));
 assert.ok(!f.sqls.some(s=>s.includes("UPDATE appointments")));
 assert.ok(f.sqls.some(s=>s.startsWith("INSERT INTO patient_appointment_creation_keys")));
 assert.ok(f.sqls.some(s=>s.includes("INSERT INTO appointment_history")));
 assert.ok(f.sqls.some(s=>s.includes("INSERT INTO audit_events")));
});
test("cancellation and reschedule requests never mutate the existing confirmed appointment",async()=>{
 for(const kind of ["cancel","reschedule"] as const){
  const f=fixture();
  const data=kind==="cancel"?{reason:"Unavailable",idempotencyKey:key}:{reason:"Change",branchId:branch,appointmentDate:"2099-06-04",appointmentTime:"11:00",idempotencyKey:key};
  const result=await f.service.change(context(),correlation,appointment,kind,data);
  assert.equal(result.status,"pending");
  assert.ok(f.sqls.some(s=>s.startsWith("INSERT INTO patient_appointment_requests")));
  assert.equal(f.sqls.some(s=>s.startsWith("UPDATE appointments")),false);
  assert.equal(f.sqls.some(s=>s.startsWith("INSERT INTO audit_events")),true);
 }
});
test("unlinked patients and terminal appointment states are denied before writes",async()=>{
 const unlinked=fixture({owned:false});
 await assert.rejects(unlinked.service.change(context(),correlation,appointment,"cancel",{idempotencyKey:key}),AuthorizationError);
 const terminal=fixture({status:"completed"});
 await assert.rejects(terminal.service.change(context(),correlation,appointment,"cancel",{idempotencyKey:key}));
 assert.equal(terminal.sqls.some(s=>s.startsWith("INSERT INTO patient_appointment_requests")),false);
});
test("unsupported client keys and invalid identifiers are rejected",async()=>{
 const f=fixture();
 await assert.rejects(f.service.create(context(),correlation,{branchId:branch,appointmentDate:"2099-05-20",idempotencyKey:key,patientId:patient}));
 await assert.rejects(f.service.change(context(),correlation,"wrong-uuid","cancel",{idempotencyKey:key}));
 assert.equal(f.recorded,0);
});
test("idempotency key with a different payload is rejected without a new booking",async()=>{
 const f=fixture({existing:true});
 await assert.rejects(f.service.create(context(),correlation,{branchId:branch,appointmentDate:"2099-05-20",idempotencyKey:key}));
 assert.equal(f.recorded,0);
});
