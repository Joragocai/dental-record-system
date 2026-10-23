import test from "node:test";
import assert from "node:assert/strict";
import { storageConfig,buildPrivateObjectPath,uploadPrivateAttachment,downloadPrivateAttachment,removePrivateAttachments } from "./privateAttachments.js";

const config={ url:"https://demo-example.supabase.co", key:"server-only-key-not-real",bucket:"dental-demo-attachments" };
test("private bucket and server-only secret are required",()=>{
 assert.throws(()=>storageConfig({SUPABASE_URL:config.url}),/SECRET_KEY/);
 assert.equal(storageConfig({SUPABASE_URL:config.url,SUPABASE_SECRET_KEY:config.key}).bucket,config.bucket);
});
test("attachment paths are generated for fixed private owners",()=>{
 assert.match(buildPrivateObjectPath("patients","P-2026-0001","application/pdf"),/^patients\/P-2026-0001\/[a-f0-9-]+\.pdf$/);
 assert.throws(()=>buildPrivateObjectPath("patients","../bad","image/png"),/Invalid/);
});
test("private upload and download require authenticated requests",async()=>{
 const calls=[];const fake=async(url,options)=>{calls.push({url,options});return{ok:true,status:200}};
 const path=buildPrivateObjectPath("patients","P-2026-0001","text/plain");
 await uploadPrivateAttachment(config,{path,mimeType:"text/plain",contents:Buffer.from("Fictional")},fake);
 await downloadPrivateAttachment(config,path,fake);
 assert.equal(calls[0].options.method,"POST");
 assert.equal(calls[0].options.headers.Authorization,"Bearer "+config.key);
 assert.match(calls[1].url,/\/object\/authenticated\/dental-demo-attachments\//);
});
test("private deletion validates all paths before making request",async()=>{
 const calls=[];const fake=async(url,options)=>{calls.push({url,options});return {ok:true,status:200}};
 const path=buildPrivateObjectPath("patients","P-2026-0001","image/png");
 await assert.rejects(removePrivateAttachments(config,[path,"../malicious"],fake),/Invalid/);
 assert.equal(calls.length,0);
 await removePrivateAttachments(config,[path],fake);
 assert.deepEqual(JSON.parse(calls[0].options.body),{prefixes:[path]});
});
