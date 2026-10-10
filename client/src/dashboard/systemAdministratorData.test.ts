import assert from "node:assert/strict";
import test from "node:test";
import {parseTechnicalAccess,parseTechnicalStatus} from "./systemAdministratorData.js";
const valid={roles:["SYSTEM_ADMINISTRATOR"],links:[{key:"system-administrator-dashboard",path:"/system-administrator-dashboard"}],systemAdministrator:{technicalAccountRead:true,roleDefinitionsConfigure:true}};
test("technical dashboard only accepts technical-only role and exact server capability",()=>{
 assert.deepEqual(parseTechnicalAccess(valid),{technicalAccountRead:true,roleDefinitionsConfigure:true});
 for(const patch of [{roles:["CLINIC_ADMINISTRATOR"]},{roles:["SYSTEM_ADMINISTRATOR","DENTIST"]},{links:[]},{systemAdministrator:{technicalAccountRead:false,roleDefinitionsConfigure:true}}]){
  assert.throws(()=>parseTechnicalAccess({...valid,...patch}));
 }
});
test("technical status denies leaked diagnostics or unknown states",()=>{
 assert.deepEqual(parseTechnicalStatus({api:"reachable",readiness:"ready"}),{api:"reachable",readiness:"ready"});
 assert.deepEqual(parseTechnicalStatus({api:"reachable",readiness:"unavailable"}),{api:"reachable",readiness:"unavailable"});
 assert.throws(()=>parseTechnicalStatus({api:"reachable",readiness:"ready",databaseHost:"private"}));
 assert.throws(()=>parseTechnicalStatus({api:"reachable",readiness:"unknown"}));
});
