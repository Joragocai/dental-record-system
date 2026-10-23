import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresAttachment, getPostgresAttachment, listPostgresAttachments, deletePostgresAttachmentMetadata } from "./attachments.js";
const sample={id:4,patient_id:"P-2026-0001",treatment_id:"T-2026-0001",attachment_type:"X-Ray",
 original_filename:"fictional.png",stored_filename:"stored.png",file_path:"demo/stored.png",
 mime_type:"image/png",file_size:123,uploaded_at:"2026-10-23T03:00:00Z"};
function mock(){
 const calls=[];const client={query:async(sql,params=[])=>{calls.push({sql,params});return{rows:[sample]}}};
 return{calls,client};
}
test("PostgreSQL attachment metadata uses parameters for insert and lookup",async()=>{
 const {client,calls}=mock();
 assert.equal((await createPostgresAttachment(client,sample)).id,4);
 assert.equal((await getPostgresAttachment(client,4)).id,4);
 assert.equal(calls[0].params[0],sample.patient_id);
 assert.equal(calls[1].params[0],4);
});
test("Patient and treatment attachment search is appropriately scoped",async()=>{
 const {client,calls}=mock();
 await listPostgresAttachments(client,{patientId:sample.patient_id,onlyPatientFiles:true});
 await listPostgresAttachments(client,{treatmentId:sample.treatment_id});
 assert.match(calls[0].sql,/treatment_id IS NULL/);
 assert.deepEqual(calls[0].params,[sample.patient_id]);
 assert.deepEqual(calls[1].params,[sample.treatment_id]);
});
test("Metadata deletion uses RETURNING; object deletion needs storage service later",async()=>{
 const {client,calls}=mock();
 const row=await deletePostgresAttachmentMetadata(client,4);
 assert.equal(row.id,4);
 assert.match(calls[0].sql,/DELETE FROM public.attachments WHERE id=\$1 RETURNING/);
});
