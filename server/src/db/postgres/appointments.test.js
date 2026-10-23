import test from "node:test";
import assert from "node:assert/strict";
import {createPostgresAppointment,updatePostgresAppointmentStatus,listPostgresAppointments} from "./appointments.js";
const row={id:7,patient_id:"P-2026-0001",first_name:"Test",last_name:"Patient",
  appointment_date:"2026-10-23",appointment_time:"09:00",status:"Scheduled"};
test("PostgreSQL appointment creation returns same API shape",async()=>{
  const calls=[];const client={query:async(sql,values)=>{calls.push({sql,values});return{rows:[row]}}};
  const created=await createPostgresAppointment(client,row);
  assert.equal(created.appointment_date,"2026-10-23");
  assert.equal(created.patient_name,"Patient, Test");
  assert.match(calls[0].sql,/RETURNING id/);
  assert.deepEqual(calls[0].values.slice(0,2),["P-2026-0001","2026-10-23"]);
});
test("PostgreSQL status updates parameterize identifiers",async()=>{
 const calls=[];const client={query:async(sql,values)=>{calls.push({sql,values});return {rows:[row]}}};
 await updatePostgresAppointmentStatus(client,7,"Completed");
 assert.equal(calls[0].values.at(-1),7);
 assert.match(calls[0].sql,/WHERE id = \$3/);
});
test("Appointment lists remain newest-first",async()=>{
 const client={query:async(sql)=>{assert.match(sql,/appointment_date DESC/);return{rows:[row]}}};
 const rows=await listPostgresAppointments(client,row.patient_id);
 assert.equal(rows[0].id,7);
});
