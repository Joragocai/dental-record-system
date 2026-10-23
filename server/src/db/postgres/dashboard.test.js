import test from "node:test";
import assert from "node:assert/strict";
import {getPostgresScheduleRows,scheduleQuery} from "./dashboard.js";
test("PostgreSQL schedule uses same clinic date and patient joins",async()=>{
 const queries=[];
 const client={query:async(sql,params)=>{queries.push({sql,params});return{rows:[
 {source_type:"appointment",source_id:1,patient_id:"P-2026-0001",first_name:"Demo",last_name:"Patient",
  schedule_date:"2026-10-23",appointment_time:"09:00",procedure_label:"Examination",status:"Scheduled"}]}}};
 const rows=await getPostgresScheduleRows(client,"2026-10-23",{includeToday:true});
 assert.equal(rows[0].patient_name,"Patient, Demo");
 assert.equal(rows[0].source_label,"Scheduled Appointment");
 assert.deepEqual(queries[0].params,["2026-10-23",false]);
 assert.match(queries[0].sql,/schedule_date = \$1::date/);
 assert.match(scheduleQuery,/t.next_appointment_date IS NOT NULL/);
});
