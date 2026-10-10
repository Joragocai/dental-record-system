import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import {createRequestIdMiddleware} from "../middleware/requestId.ts";
import {createPortalRecordsRouter} from "./portalRecords.js";
import {createTreatmentPublicationRouter} from "./treatmentPublication.js";
import {AuthenticationError} from "../auth/authErrors.ts";
import {AuthorizationError} from "../services/authorizationErrors.ts";

const userid="11111111-1111-4111-8111-111111111111";
const authid="22222222-2222-4222-8222-222222222222";
const requestid="33333333-3333-4333-8333-333333333333";
const clinicalid="44444444-4444-4444-8444-444444444444";

async function serve(access,callback){
 const app=express();app.use(createRequestIdMiddleware({createId:()=>requestid}));app.use(express.json());
 const auth={async authenticateAuthorizationHeader(header){
  if(!header)throw new AuthenticationError("CREDENTIALS_MISSING");
  return {subject:authid,email:"fictional@example.test",audience:"authenticated",provider:"supabase"};
 }};
 app.use("/api/me",createPortalRecordsRouter(auth,access,{
  async profile(){return {patientCode:"P-2026-0001",firstName:"Fictional",lastName:"A",mobileNumber:"09170000000",homeAddress:null}},
  async treatments(){return []},async appointments(){return []},async updateContact(){return {}}
 }));
 app.use("/api/portal-treatments",createTreatmentPublicationRouter(auth,access,{async publish(){return {published:true}}}));
 app.use((error,_req,res,_next)=>{res.status(error?.status??500).json({message:"Request denied"})});
 const server=http.createServer(app);
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{const address=server.address();assert.ok(address && typeof address==="object");await callback("http://127.0.0.1:"+address.port)}
 finally{await new Promise(resolve=>server.close(resolve))}
}
function boundary(authorized=false){
 const deny=(_req,_res,next)=>next(new AuthorizationError("AUTHORIZATION_DENIED"));
 return {
  resolveApplicationUser(_req,res,next){res.locals.applicationUser={userId:userid,authUserId:authid};next()},
  resolveAuthorization(_req,res,next){res.locals.authorization={userId:userid,authUserId:authid};next()},
  requireAnyBranchPermission(){return authorized?(_req,_res,next)=>next():deny}
 };
}
test("all 14B patient endpoints require authentication",async()=>{
 await serve(boundary(),async base=>{
  for(const [method,path]of [["GET","/api/me/patient-profile"],["PATCH","/api/me/patient-profile"],["GET","/api/me/treatments"],["GET","/api/me/appointments"],["POST","/api/portal-treatments/"+clinicalid+"/publish"]]){
   const result=await fetch(base+path,{method,headers:{"content-type":"application/json"},body:method==="GET"?undefined:"{}"});
   assert.equal(result.status,401,path+" must authenticate");
  }
 });
});
test("treatment publication route refuses branch authorization before service call",async()=>{
 await serve(boundary(),async base=>{
  const result=await fetch(base+"/api/portal-treatments/"+clinicalid+"/publish",{method:"POST",headers:{Authorization:"Bearer fiction","content-type":"application/json"},body:JSON.stringify({summary:"Allowed summary"})});
  assert.equal(result.status,403);
 });
});
