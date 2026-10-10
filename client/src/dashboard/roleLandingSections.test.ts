import assert from "node:assert/strict";
import test from "node:test";
import {parseLandingContext,landingSections} from "./roleLandingSections.js";
const branch="10000000-0000-4000-8000-000000000003";
const base={displayName:"Fictional User",roles:["PATIENT"],branchIds:[],links:[{key:"patient-portal",label:"My dental records",path:"/patient-portal"},{key:"patient-finance",label:"My balance",path:"/patient-finance"}]};
test("patient receives OWN-only links without clinic navigation",()=>{
 const safe=parseLandingContext(base);
 assert.deepEqual(landingSections(safe).map(x=>x.title),["My patient portal"]);
 assert.deepEqual(landingSections(safe)[0].links.map(x=>x.key),["patient-portal","patient-finance"]);
 assert.throws(()=>parseLandingContext({...base,roles:["PATIENT","PERSONNEL"]}));
 assert.throws(()=>parseLandingContext({...base,branchIds:[branch]}));
 assert.throws(()=>parseLandingContext({...base,links:[...base.links,{key:"appointments",label:"Clinic",path:"/appointments"}]}));
});
test("owner-dentist retains one identity and separates independently granted workspaces",()=>{
 const owner=parseLandingContext({displayName:"Fictional Owner",roles:["CLINIC_ADMINISTRATOR","DENTIST"],branchIds:[branch],links:[
 {key:"dentist-dashboard",path:"/dentist-dashboard",label:"Clinical"},
 {key:"clinic-administrator-dashboard",path:"/clinic-administrator-dashboard",label:"Business"},
 {key:"appointments",path:"/appointments",label:"Schedule"}
 ]});
 assert.deepEqual(landingSections(owner).map(x=>x.title),["Clinical workspace","Clinic management"]);
 assert.deepEqual(landingSections(owner)[0].links.map(x=>x.key),["dentist-dashboard","appointments"]);
 assert.deepEqual(landingSections(owner)[1].links.map(x=>x.key),["clinic-administrator-dashboard"]);
 assert.equal(owner.roles.length,2);
});
test("technical account cannot inherit owner-dentist or patient modules",()=>{
 assert.throws(()=>parseLandingContext({displayName:"System",roles:["SYSTEM_ADMINISTRATOR","DENTIST"],branchIds:[],links:[]}));
 assert.throws(()=>parseLandingContext({...base,roles:["SYSTEM_ADMINISTRATOR"],links:base.links}));
 assert.throws(()=>parseLandingContext({...base,roles:["SYSTEM_ADMINISTRATOR"],branchIds:[branch],links:[]}));
 assert.throws(()=>parseLandingContext({...base,roles:["PERSONNEL"]}));
});
test("unknown, mistyped or redirected paths are denied",()=>{
 assert.throws(()=>parseLandingContext({...base,links:[{key:"patient-portal",label:"Portal",path:"https://evil.example"}]}));
 assert.throws(()=>parseLandingContext({...base,links:[{key:"invented",label:"Unknown",path:"/unknown"}]}));
 assert.throws(()=>parseLandingContext({...base,links:[{key:"patient-portal",label:"Incorrect",path:"/appointments"}]}));
});
