import assert from "node:assert/strict";
import test from "node:test";
import type {PgQueryExecutor} from "../postgres/pool.js";
import type {QueryResult,QueryResultRow} from "pg";
function fixture(rows:Record<string,unknown>[],observe:(sql:string,values?:readonly unknown[])=>void):PgQueryExecutor{
 return {async query<R extends QueryResultRow>(sql:string,values?:readonly unknown[]):Promise<QueryResult<R>>{
  observe(sql,values);return {rows:rows as R[],rowCount:rows.length,command:"SELECT",oid:0,fields:[]};
 }};
}
import {createPortalRecordsRepository} from "../repositories/portalRecordsRepository.js";

test("profile query scopes the patient UUID and exposes only whitelisted columns",async()=>{
 let sql="";let args;
 const repo=createPortalRecordsRepository(fixture([{patient_code:"P-2026-0001",first_name:"Fictional",last_name:"A",mobile_number:"09170000001",home_address:"Test street"}],(statement,values)=>{sql=statement;args=values}));
 const result=await repo.profile("11111111-1111-4111-8111-111111111111");
 assert.deepEqual(result,{patientCode:"P-2026-0001",firstName:"Fictional",lastName:"A",mobileNumber:"09170000001",homeAddress:"Test street"});
 assert.ok(sql.includes("WHERE id=$1"));assert.equal(args?.[0],"11111111-1111-4111-8111-111111111111");
 assert.ok(!sql.includes("medical_alert_summary"));assert.ok(!sql.includes("email_address"));
});
test("treatment history returns published summaries only, never financial columns or notes",async()=>{
 let sql="";
 const repo=createPortalRecordsRepository(fixture([{treatment_code:"T-2026-0001",treatment_date:"2026-10-01",patient_portal_summary:"Cleaning performed"}],statement=>{sql=statement}));
 const result=await repo.treatments("11111111-1111-4111-8111-111111111111");
 assert.deepEqual(result,[{code:"T-2026-0001",date:"2026-10-01",summary:"Cleaning performed"}]);
 assert.match(sql,/patient_id=\$1 AND patient_visible=TRUE/);
 for(const field of ["amount_paid","balance","remarks","amount_charged","discount_amount","internal_notes"]){assert.ok(!sql.includes(field))}
});
test("patient appointment history does not expose staff notes, dentist identity, or patient record ids",async()=>{
 let sql="";
 const repo=createPortalRecordsRepository(fixture([{id:"22222222-2222-4222-8222-222222222222",appointment_date:"2026-10-02",appointment_time:null,status:"confirmed",branch_name:"Test Clinic"}],statement=>{sql=statement}));
 const result=await repo.appointments("11111111-1111-4111-8111-111111111111");
 assert.equal(result.length,1);assert.equal(result[0]?.time,null);
 assert.match(sql,/WHERE a.patient_id=\$1/);
 for(const field of ["notes","dentist_user_id","patient_code"]){assert.ok(!sql.includes(field))}
});
