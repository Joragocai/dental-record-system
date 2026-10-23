import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { getManilaTodayIso } from "../utils/dateUtils.js";
import { getPostgresPool } from "../db/postgres/pool.js";
import { createPostgresClinicalRouter } from "./postgresClinical.js";

const integration = process.env.PG_INTEGRATION_TEST === "1" ? test : test.skip;

integration("PostgreSQL clinical API roundtrip with disposable fictional records",async()=>{
 const database = new URL(process.env.DATABASE_URL || "");
 assert.equal(database.hostname,"127.0.0.1","Integration test must run against local PostgreSQL only");
 assert.equal(database.pathname,"/dental_presentation_test","Integration test must use the dedicated disposable DB only");
 assert.notEqual(process.env.NODE_ENV,"production");
 const pool=await getPostgresPool();
 const app=express();
 app.use(express.json());
 app.use("/api",createPostgresClinicalRouter(pool));
 app.use((error,req,res,next)=>res.status(error.status||500).json({message:error.message}));
 const server=createServer(app);
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const origin="http://127.0.0.1:"+server.address().port;
 let patientId=null;
 let treatmentId=null;
 let appointmentId=null;
 const date=getManilaTodayIso();
 async function call(path,method="GET",body=null){
  const response=await fetch(origin+path,{method,headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
  const data=await response.json();
  assert.ok(response.ok,`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
 }
 try{
  const patient=await call("/api/patients","POST",{
   date_registered:date,last_name:"FICTIONAL_DB_TEST",first_name:"Test",
   birthday:"1990-01-01",gender:"Female",mobile_number:"09170000000",
   is_minor:"No",discount_eligibility:"None",reason_for_consultation:"FAKE INTEGRATION TEST"
  });
  patientId=patient.patient_id;
  assert.match(patientId,/^P-\d{4}-\d{4}$/);
  assert.equal((await call("/api/patients/"+patientId)).last_name,"FICTIONAL_DB_TEST");

  const appointment=await call("/api/patients/"+patientId+"/appointments","POST",{
   appointment_date:date,appointment_time:"09:00",planned_procedure:"Demo Test",
   notes:"Fictional only",status:"Scheduled"
  });
  appointmentId=appointment.id;
  assert.equal((await call("/api/patients/"+patientId+"/appointments")).length,1);

  const created=await call("/api/treatments","POST",{
   patient_id:patientId,treatment_date:date,procedure:"Demo Cleaning",
   dentists:"Demo Dentist",amount_charged:8000,discount_type:"None",discount_percent:0,
   discount_amount:0,net_amount_due:8000,amount_paid:1000,balance:7000,
   initial_payment_method:"Cash",remarks:"Fictional data only"
  });
  treatmentId=created.treatment_id;
  assert.match(treatmentId,/^T-\d{4}-\d{4}$/);
  const txn=await call("/api/treatments/"+treatmentId+"/payments","POST",{
   amount:"1500.00",payment_date:date,payment_method:"GCash",reference:"FAKE",notes:"Test only",request_id:randomUUID()
  });
  assert.equal(txn.treatment.amount_paid,2500);
  const ledger=await call("/api/treatments/"+treatmentId+"/payments");
  assert.equal(ledger.payments.length,2);
  const rev=await call("/api/treatments/"+treatmentId+"/payments/"+txn.payment.id+"/reverse","POST",{
   request_id:randomUUID(),reason:"Fictional reversal verification"
  });
  assert.equal(rev.treatment.amount_paid,1000);
  const report=await call("/api/balances");
  assert.ok(report.records.some(row=>row.treatment_id===treatmentId));
 }finally{
  // Remove only the records created in this integration test.
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   if(treatmentId){
    await client.query("DELETE FROM public.treatment_payments WHERE treatment_id=$1",[treatmentId]);
    await client.query("DELETE FROM public.treatments WHERE treatment_id=$1",[treatmentId]);
   }
   if(appointmentId)await client.query("DELETE FROM public.appointments WHERE id=$1",[appointmentId]);
   if(patientId)await client.query("DELETE FROM public.patients WHERE patient_id=$1 AND last_name='FICTIONAL_DB_TEST'",[patientId]);
   await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error}
  finally{client.release();await new Promise(resolve=>server.close(resolve));await pool.end()}
 }
});
