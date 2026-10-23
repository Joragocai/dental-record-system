import test from "node:test";
import assert from "node:assert/strict";
import {createPostgresTreatment,getPostgresTreatment,updatePostgresTreatment,listPostgresTreatments} from "./treatments.js";

const now="2026-10-23T08:00:00.000Z";
const record={treatment_id:"T-2026-0040",patient_id:"P-2026-0040",treatment_date:"2026-10-23",
  procedure:"Fictional checkup",dentists:"Demo Dentist",amount_charged:8000,discount_type:"None",
  discount_percent:0,discount_amount:0,net_amount_due:8000,amount_paid:1500,balance:6500,
  initial_payment_method:"Cash"};
function fakePool(){
 const calls=[];
 const db={query:async(sql,values=[])=>{
  calls.push({sql,values});
  if(sql.includes("SELECT patient_id FROM public.treatments"))return{rows:[{patient_id:record.patient_id}]};
  if(sql.includes("SUM(amount_cents)"))return{rows:[{total:"150000"}]};
  if(sql.includes("SELECT t.*"))return{rows:[{...record,attachment_count:"0"}]};
  return{rows:[]};
 },release:()=>calls.push({sql:"released"})};
 return {pool:{connect:async()=>db},client:db,calls};
}
test("Treatment creation atomically inserts treatment and initial ledger event",async()=>{
 const {pool,calls}=fakePool();
 const result=await createPostgresTreatment(pool,record,now);
 assert.equal(result.treatment_id,record.treatment_id);
 const insert=calls.find(({sql})=>sql.includes("INSERT INTO public.treatments"));
 assert.ok(insert);
 assert.equal(insert.values[14],"1500.00");
 assert.equal(calls.filter(({sql})=>sql.includes("INSERT INTO public.treatment_payments")).length,1);
 assert.equal(calls.at(-2).sql,"COMMIT");
});
test("Treatment edit locks row and never edits cumulative paid balance directly",async()=>{
 const {pool,calls}=fakePool();
 await updatePostgresTreatment(pool,record.treatment_id,{...record,net_amount_due:7000},now);
 assert.match(calls[1].sql,/FOR UPDATE/);
 const update=calls.find(({sql})=>sql.startsWith("UPDATE public.treatments"));
 assert.ok(update);
 assert.equal(update.values.at(-2),now);
 assert.ok(update.values.includes("5500.00"));
 assert.doesNotMatch(update.sql,/patient_id=/);
});
test("Treatment cannot be reduced below previously received payments",async()=>{
 const {pool,calls}=fakePool();
 await assert.rejects(updatePostgresTreatment(pool,record.treatment_id,{...record,net_amount_due:1000},now),/below payments/);
 assert.equal(calls.some(({sql})=>sql.startsWith("UPDATE public.treatments")),false);
 assert.equal(calls.at(-2).sql,"ROLLBACK");
});
test("List and lookup use parameterized treatment identifier",async()=>{
 const {client,calls}=fakePool();
 const one=await getPostgresTreatment(client,record.treatment_id);
 const list=await listPostgresTreatments(client,record.patient_id);
 assert.equal(one.treatment_id,record.treatment_id);
 assert.equal(list.length,1);
 assert.deepEqual(calls[0].values,[record.treatment_id]);
 assert.deepEqual(calls[1].values,[record.patient_id]);
});
