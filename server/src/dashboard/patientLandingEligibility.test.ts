import assert from "node:assert/strict";
import test from "node:test";
import {requirePatientDashboardLink} from "./patientLandingEligibility.js";
import type {AuthorizationContext} from "../services/authorizationService.js";
const base: AuthorizationContext={userId:"10000000-0000-4000-8000-000000000001",authUserId:"20000000-0000-4000-8000-000000000002",email:"fictional@example.test",displayName:"Fictional Patient",status:"active",roles:["PATIENT"],branchIds:[],permissions:[{code:"portal.profile.read",scope:"OWN"}]};
function repo(status:"active"|"pending"|"revoked"|null,userId=base.userId){return {async getByUserId(){return status?{appUserId:userId,patientId:"30000000-0000-4000-8000-000000000003",status}:null;}};}
test("only linked and active patient passes dashboard eligibility",async()=>{
 await requirePatientDashboardLink(base,repo("active"));
 for(const state of ["pending","revoked",null] as const)await assert.rejects(requirePatientDashboardLink(base,repo(state)));
 await assert.rejects(requirePatientDashboardLink(base,repo("active","40000000-0000-4000-8000-000000000004")));
});
test("patient dashboard fails closed for mixed role, accidental branch and missing OWN permission",async()=>{
 await assert.rejects(requirePatientDashboardLink({...base,roles:["PATIENT","DENTIST"]},repo("active")));
 await assert.rejects(requirePatientDashboardLink({...base,branchIds:["40000000-0000-4000-8000-000000000004"]},repo("active")));
 await assert.rejects(requirePatientDashboardLink({...base,permissions:[]},repo("active")));
 await assert.rejects(requirePatientDashboardLink({...base,status:"pending"},repo("active")));
});
test("staff accounts never query patient linkage",async()=>{
 let called=false;
 await requirePatientDashboardLink({...base,roles:["DENTIST"]},{async getByUserId(){called=true;throw Error("unexpected");}});
 assert.equal(called,false);
});
