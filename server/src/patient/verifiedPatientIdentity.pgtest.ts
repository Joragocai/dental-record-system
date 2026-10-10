import assert from "node:assert/strict";
import test from "node:test";
import {createVerifiedPatientIdentityService} from "./verifiedPatientIdentity.js";
import {PatientEnrollmentError} from "../services/patientEnrollmentErrors.js";
const uid="11111111-1111-4111-8111-111111111111";
const config={supabaseUrl:"https://fictional.supabase.co",publishableKey:"public-fixture",expectedAudience:"authenticated",requestTimeoutMs:1000};
function provider(body:unknown,status=200){
 let called="";
 let token="";
 const svc=createVerifiedPatientIdentityService(config,async(input,init)=>{
  called=String(input);token=new Headers(init?.headers).get("authorization")??"";
  return new Response(JSON.stringify(body),{status});
 });
 return {svc,get called(){return called},get token(){return token}};
}
function denied(error:unknown){return error instanceof PatientEnrollmentError&&error.code==="IDENTITY_UNVERIFIED"}
test("only matching confirmed Supabase identity returns confirmed email",async()=>{
 const p=provider({id:uid,email:"Adult@Example.test",email_confirmed_at:"2026-10-10T00:00:00Z"});
 assert.deepEqual(await p.svc.requireConfirmedEmail("fictional-invite-session",uid),{authUserId:uid,email:"adult@example.test"});
 assert.equal(p.called,"https://fictional.supabase.co/auth/v1/user");
 assert.equal(p.token,"Bearer fictional-invite-session");
});
test("unconfirmed, mismatched, missing and failed provider users are denied",async()=>{
 for(const body of [{id:uid,email:"a@example.test",email_confirmed_at:null},
 {id:"22222222-2222-4222-8222-222222222222",email:"a@example.test",email_confirmed_at:"2026-10-10T00:00:00Z"},
 {id:uid,email:"a@example.test",email_confirmed_at:"invalid"},
 {id:uid,email:null,email_confirmed_at:"2026-10-10T00:00:00Z"}]){
  await assert.rejects(provider(body).svc.requireConfirmedEmail("fictional",uid),denied);
 }
 await assert.rejects(provider({},401).svc.requireConfirmedEmail("fictional",uid),denied);
});
