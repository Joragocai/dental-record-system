import assert from "node:assert/strict";
import test from "node:test";
import {
  clinicLocalClock, parseDentistAccess, permittedDentistBranches,
  dentistAppointmentListPath, summarizeDentistDay, visibleDentistSummary
} from "./dentistDashboardData.js";

const branch = "10000000-0000-4000-8000-000000000001";
const otherBranch = "20000000-0000-4000-8000-000000000002";
const user = "30000000-0000-4000-8000-000000000003";
const another = "40000000-0000-4000-8000-000000000004";
const appointment = "50000000-0000-4000-8000-000000000005";
const dentistContext = (overrides: Record<string,unknown> = {}) => ({
  roles:["DENTIST"], branchIds:[branch], links:[{key:"dentist-dashboard",path:"/dentist-dashboard"}],
  dentist:{userId:user,patientLookup:true,requestReview:true,treatmentPublish:true,documentVisibility:true},
  ...overrides
});
const now = new Date("2026-10-10T00:00:00.000Z");
const day = "2026-10-10";
test("Dentist access denies Personnel, technical administrator, branchless and missing shortcut", () => {
  assert.equal(parseDentistAccess(dentistContext()).selfUserId,user);
  assert.throws(()=>parseDentistAccess(dentistContext({roles:["PERSONNEL"]})));
  assert.throws(()=>parseDentistAccess(dentistContext({roles:["DENTIST","SYSTEM_ADMINISTRATOR"]})));
  assert.throws(()=>parseDentistAccess(dentistContext({branchIds:[]})));
  assert.throws(()=>parseDentistAccess(dentistContext({links:[]})));
  assert.deepEqual(parseDentistAccess(dentistContext({roles:["CLINIC_ADMINISTRATOR","DENTIST"]})).branchIds,[branch]);
});
test("Scheduling branches never include branches outside assigned membership",()=>{
  const actual=permittedDentistBranches({branches:[
    {id:branch,branchCode:"MAIN",branchName:"Fictional Clinic"},
    {id:otherBranch,branchCode:"OTHER",branchName:"Other Fictional Clinic"}
  ]},parseDentistAccess(dentistContext()));
  assert.deepEqual(actual.map((item)=>item.id),[branch]);
});
test("Dentist appointment request always specifies branch, day and verified own app user",()=>{
  const url=dentistAppointmentListPath(branch,day,user);
  assert.equal(new URLSearchParams(url.split("?")[1]).get("dentistUserId"),user);
  assert.equal(new URLSearchParams(url.split("?")[1]).get("branchId"),branch);
  assert.throws(()=>dentistAppointmentListPath("not-id",day,user));
  assert.throws(()=>dentistAppointmentListPath(branch,"2026-02-30",user));
});
test("Schedule summary rejects different dentist, cross-branch, date, invented status and duplicate record",()=>{
  const row={id:appointment,branchId:branch,dentistUserId:user,appointmentDate:day,appointmentTime:"09:30:00",status:"confirmed"};
  assert.equal(summarizeDentistDay([row],branch,day,user,now).confirmed,1);
  assert.throws(()=>summarizeDentistDay([{...row,dentistUserId:another}],branch,day,user,now));
  assert.throws(()=>summarizeDentistDay([{...row,branchId:otherBranch}],branch,day,user,now));
  assert.throws(()=>summarizeDentistDay([{...row,appointmentDate:"2026-10-11"}],branch,day,user,now));
  assert.throws(()=>summarizeDentistDay([{...row,status:"unknown"}],branch,day,user,now));
  assert.throws(()=>summarizeDentistDay([row,row],branch,day,user,now));
});
test("Next timed slot excludes past visits and pending without claiming any patient identity",()=>{
  const base={id:appointment,branchId:branch,dentistUserId:user,appointmentDate:day};
  const rows=[
    {...base,id:"60000000-0000-4000-8000-000000000006",appointmentTime:"07:30:00",status:"confirmed"},
    {...base,id:"70000000-0000-4000-8000-000000000007",appointmentTime:"08:30:00",status:"checked_in"},
    {...base,id:"80000000-0000-4000-8000-000000000008",appointmentTime:"10:30:00",status:"confirmed"},
    {...base,id:"90000000-0000-4000-8000-000000000009",appointmentTime:"11:30:00",status:"pending_confirmation"}
  ];
  const result=summarizeDentistDay(rows,branch,day,user,now);
  assert.deepEqual(result.nextSlot,{time:"08:30",status:"checked_in"});
  assert.deepEqual(result.upcomingSlots.map((slot)=>slot.time),["08:30","10:30"]);
  assert.equal(result.pendingConfirmation,1);
  assert.equal(JSON.stringify(result).includes("patient"),false);
});
test("Clinic timezone and branch/date/same-user envelope prevent stale display",()=>{
  assert.deepEqual(clinicLocalClock(new Date("2026-10-09T16:20:00Z")),{date:day,time:"00:20"});
  const summary=summarizeDentistDay([],branch,day,user,now);
  const envelope={branchId:branch,date:day,selfUserId:user,summary};
  assert.equal(visibleDentistSummary(envelope,branch,day,user,true),summary);
  assert.equal(visibleDentistSummary(envelope,otherBranch,day,user,true),null);
  assert.equal(visibleDentistSummary(envelope,branch,"2026-10-11",user,true),null);
  assert.equal(visibleDentistSummary(envelope,branch,day,another,true),null);
  assert.equal(visibleDentistSummary(envelope,branch,day,user,false),null);
});
