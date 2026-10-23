import { normalizePgRow } from "./format.js";

const columns=["patient_id","treatment_id","attachment_type","original_filename",
  "stored_filename","file_path","mime_type","file_size","uploaded_at"];
export async function createPostgresAttachment(client,input){
 const values=columns.map(field=>input[field]??null);
 const sql=`INSERT INTO public.attachments (${columns.join(",")}) VALUES
  (${columns.map((_,i)=>"$"+(i+1)).join(",")}) RETURNING *`;
 const {rows}=await client.query(sql,values);
 return normalizePgRow(rows[0]);
}
export async function getPostgresAttachment(client,id){
 const {rows}=await client.query("SELECT * FROM public.attachments WHERE id=$1",[id]);
 return normalizePgRow(rows[0]);
}
export async function listPostgresAttachments(client,filter={}){
 const clauses=[];
 const params=[];
 if(filter.patientId){params.push(filter.patientId);clauses.push(`patient_id=$${params.length}`);}
 if(filter.treatmentId){params.push(filter.treatmentId);clauses.push(`treatment_id=$${params.length}`);}
 else if(filter.onlyPatientFiles===true)clauses.push("treatment_id IS NULL");
 else if(filter.onlyTreatmentFiles===true)clauses.push("treatment_id IS NOT NULL");
 const sql="SELECT * FROM public.attachments"+
  (clauses.length?" WHERE "+clauses.join(" AND "):"")+" ORDER BY uploaded_at DESC,id DESC";
 const {rows}=await client.query(sql,params);
 return rows.map(normalizePgRow);
}
export async function deletePostgresAttachmentMetadata(client,id){
 const {rows}=await client.query("DELETE FROM public.attachments WHERE id=$1 RETURNING *",[id]);
 return normalizePgRow(rows[0]);
}
