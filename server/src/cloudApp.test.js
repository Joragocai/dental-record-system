import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createCloudApp } from "./cloudApp.js";

const userId = randomUUID();
const config={ issuer:"https://example.supabase.co/auth/v1",allowedUserId:userId,projectUrl:"https://example.supabase.co" };
async function withServer(verifier, cb) {
 const app=createCloudApp({config,verifier,origins:["http://127.0.0.1:5173"],
  pool:{query:async(sql)=>({rows:sql.includes("public.patients")?[]:[]})}});
 const server=createServer(app);
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{await cb("http://127.0.0.1:"+server.address().port)}
 finally{await new Promise(resolve=>server.close(resolve))}
}
test("cloud requires explicit CORS configuration",()=> {
 assert.throws(()=>createCloudApp({config,origins:[]}),/CLOUD_ALLOWED_ORIGINS/);
});
test("health is public but patient and demo endpoints reject anonymous users",async()=>{
 await withServer(async()=>({userId}),async origin=>{
  assert.equal((await fetch(origin+"/api/health")).status,200);
  for(const endpoint of ["/api/patients","/api/attachments/1/preview","/api/attachments/1/download","/api/patients/P-2026-0001/attachments","/api/runtime/demo-data/load","/api/backup/status","/api/export/patients"]){
   assert.equal((await fetch(origin+endpoint)).status,401);
  }
 });
});
test("authorized header can reach PostgreSQL router while unconverted routes remain unavailable",async()=>{
 await withServer(async()=>({userId}),async origin=>{
  const options={headers:{Authorization:"Bearer sample.token.value"}};
  const patients=await fetch(origin+"/api/patients",options);
  assert.equal(patients.status,200);
  assert.deepEqual(await patients.json(),[]);
  const disabled=await fetch(origin+"/api/runtime/demo-data/load",{...options,method:"POST",headers:{...options.headers,"Content-Type":"application/json"},body:JSON.stringify({confirmation:"LOAD DEMO DATA"})});
  assert.equal(disabled.status,403);
 });
});
test("runtime status preflight permits the authorized browser request",async()=>{
 await withServer(async()=>({userId}),async origin=>{
  const response=await fetch(origin+"/api/runtime/status",{
   method:"OPTIONS",headers:{Origin:"http://127.0.0.1:5173",
    "Access-Control-Request-Method":"GET",
    "Access-Control-Request-Headers":"authorization"}
  });
  assert.equal(response.status,204);
  assert.match(response.headers.get("access-control-allow-headers")||"",/Authorization/i);
 });
});
test("clinical responses prevent caching for both authorized and anonymous requests",async()=>{
 await withServer(async()=>({userId}),async origin=>{
  for(const headers of [{},{Authorization:"Bearer authorized-token"}]){
   const response=await fetch(origin+"/api/patients",{headers});
   assert.equal(response.headers.get("cache-control"),"no-store");
   assert.equal(response.status,headers.Authorization?200:401);
  }
 });
});
test("CORS only allows the configured clinic origin",async()=>{
 await withServer(async()=>({userId}),async origin=>{
  const allowed=await fetch(origin+"/api/patients",{
   method:"OPTIONS",
   headers:{Origin:"http://127.0.0.1:5173","Access-Control-Request-Method":"GET","Access-Control-Request-Headers":"authorization"}
  });
  assert.equal(allowed.status,204);
  assert.equal(allowed.headers.get("access-control-allow-origin"),"http://127.0.0.1:5173");
  const denied=await fetch(origin+"/api/patients",{
   method:"OPTIONS",
   headers:{Origin:"https://untrusted.example","Access-Control-Request-Method":"GET","Access-Control-Request-Headers":"authorization"}
  });
  assert.notEqual(denied.headers.get("access-control-allow-origin"),"https://untrusted.example");
 });
});
test("wrong or expired token denies cloud APIs",async()=>{
 await withServer(async()=>{throw new Error("expired")},async origin=>{
  const response=await fetch(origin+"/api/patients",{headers:{Authorization:"Bearer invalid"}});
  assert.equal(response.status,401);
 });
});
