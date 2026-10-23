import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createPostgresClinicalRouter } from "./postgresClinical.js";

async function serve(mock,cb) {
 const app=express();
 app.use(express.json());
 app.use("/api",createPostgresClinicalRouter(mock));
 app.use((error,req,res,next)=>res.status(error.status||500).json({message:error.message}));
 const server=createServer(app);
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try { await cb("http://127.0.0.1:"+server.address().port); }
 finally { await new Promise(resolve=>server.close(resolve)); }
}

test("isolated PostgreSQL HTTP router returns records and schema-compatible ID preview",async()=>{
 const calls=[];
 const pool={query:async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql.includes("public.public_id_counters")) return {rows:[{last_value:39}]};
  if(sql.includes("public.patients")) return {rows:[]};
  return {rows:[]};
 }};
 await serve(pool,async base=>{
  const patients=await fetch(base+"/api/patients");
  assert.equal(patients.status,200);
  assert.deepEqual(await patients.json(),[]);
  const preview=await fetch(base+"/api/patients/next-id");
  assert.equal(preview.status,200);
  assert.match((await preview.json()).patient_id,/^P-\d{4}-0040$/);
  const missing=await fetch(base+"/api/patients/P-2026-9999");
  assert.equal(missing.status,404);
  assert.equal((await missing.json()).message,"Patient not found.");
 });
 assert.ok(calls.some(({sql})=>sql.includes("public.public_id_counters")));
});

test("PostgreSQL HTTP router rejects appointment edits without a matching record",async()=>{
 const pool={query:async()=>({rows:[]})};
 await serve(pool,async base=>{
  const res=await fetch(base+"/api/appointments/123",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:"Completed"})});
  assert.equal(res.status,404);
 });
});
