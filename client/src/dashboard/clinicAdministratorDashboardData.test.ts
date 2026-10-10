import assert from "node:assert/strict";
import test from "node:test";
import {parseClinicAdministratorAccess,parseSafeAuditActivity} from "./clinicAdministratorDashboardData.js";
const caps={auditRead:true,staffCreate:true,roleApprove:true,financialOversight:true,expenseApprove:true,payableApprove:true,closingApprove:true};
function context(overrides:Record<string,unknown>={}){return {roles:["CLINIC_ADMINISTRATOR"],links:[{key:"clinic-administrator-dashboard",path:"/clinic-administrator-dashboard"}],clinicAdministrator:caps,...overrides};}
test("administrative access requires server-derived role and specific dashboard navigation",()=>{
 assert.deepEqual(parseClinicAdministratorAccess(context()),caps);
 assert.throws(()=>parseClinicAdministratorAccess(context({roles:["DENTIST"]})));
 assert.throws(()=>parseClinicAdministratorAccess(context({roles:["SYSTEM_ADMINISTRATOR","CLINIC_ADMINISTRATOR"]})));
 assert.throws(()=>parseClinicAdministratorAccess(context({links:[]})));
 assert.throws(()=>parseClinicAdministratorAccess(context({clinicAdministrator:{...caps,auditRead:"true"}})));
});
test("audit projection discards target identifiers and sensitive metadata",()=>{
 const result=parseSafeAuditActivity({limit:10,offset:0,items:[{
  action:"USER_ACTIVATED",occurredAt:"2026-10-10T10:00:00.000Z",outcome:"SUCCESS",
  actorUserId:"secret",targetId:"secret",metadata:{internalNotes:"secret"}
 }]});
 assert.deepEqual(result,[{action:"USER_ACTIVATED",occurredAt:"2026-10-10T10:00:00.000Z",outcome:"SUCCESS"}]);
 assert.equal(JSON.stringify(result).includes("secret"),false);
 assert.throws(()=>parseSafeAuditActivity({limit:100,offset:0,items:[]}));
 assert.throws(()=>parseSafeAuditActivity({limit:10,offset:0,items:[{action:"bad",occurredAt:"2026-10-10",outcome:"SUCCESS"}]}));
});
