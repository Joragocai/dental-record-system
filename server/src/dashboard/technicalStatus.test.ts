import assert from "node:assert/strict";
import test from "node:test";
import { getTechnicalStatus } from "./technicalStatus.js";
import type { AuthorizationContext } from "../services/authorizationService.js";
const base: AuthorizationContext = {
 userId:"10000000-0000-4000-8000-000000000001",
 authUserId:"20000000-0000-4000-8000-000000000002",displayName:"Fictional Technician",
 email:"fictional@example.test",status:"active",branchIds:[],
 roles:["SYSTEM_ADMINISTRATOR"],permissions:[{code:"user.read",scope:"GLOBAL"}]
};
test("only authorized technical-only identity may read sanitized readiness",async()=>{
 assert.deepEqual(await getTechnicalStatus(base,async()=>true),{api:"reachable",readiness:"ready"});
 assert.deepEqual(await getTechnicalStatus(base,async()=>false),{api:"reachable",readiness:"unavailable"});
 assert.deepEqual(await getTechnicalStatus(base,async()=>{throw new Error("secret DATABASE_URL");}),{api:"reachable",readiness:"unavailable"});
});
test("rejects anonymous, deactivated, mixed-role, missing or wrong scope grant",async()=>{
 const denied: Array<AuthorizationContext | undefined> = [undefined,{...base,status:"deactivated"},{...base,roles:["SYSTEM_ADMINISTRATOR","DENTIST"]},
 {...base,roles:["CLINIC_ADMINISTRATOR"]},{...base,permissions:[]},
 {...base,permissions:[{code:"user.read",scope:"BRANCH"}]}];
 for(const actor of denied){
  let called=false;
  await assert.rejects(getTechnicalStatus(actor,async()=>{called=true;return true}),{status:403});
  assert.equal(called,false);
 }
});
