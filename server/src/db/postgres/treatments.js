import { paymentMethods, toCents } from "../../utils/paymentValidation.js";
import { asPgMoney, fromPgCents, fromPgMoneyCents, normalizePgRow } from "./format.js";
import { withPostgresTransaction } from "./pool.js";

const fields = ["treatment_id","patient_id","treatment_date","tooth_numbers","next_appointment","next_appointment_date","next_appointment_time","procedure","dentists","amount_charged","discount_type","discount_percent","discount_amount","net_amount_due","amount_paid","balance","remarks"];
const monetary = new Set(["amount_charged","discount_amount","net_amount_due","amount_paid","balance"]);
const queryBase = `SELECT t.*, (SELECT COUNT(*) FROM public.attachments a WHERE a.treatment_id=t.treatment_id) AS attachment_count FROM public.treatments t`;

const failure=(message,status=400)=>Object.assign(new Error(message),{status});
function decorate(raw) {
 const row=normalizePgRow(raw);
 if(!row)return null;
 return {...row,next_appointment_date:row.next_appointment_date||row.next_appointment||"",
 next_appointment_time:row.next_appointment_time||"",next_appointment:row.next_appointment_date||row.next_appointment||"",
 discount_type:row.discount_type||"None",discount_percent:Number(row.discount_percent||0)};
}
function valueFor(field,input) {
 const value=input[field]??null;
 if(field==="next_appointment_date")return value||null;
 if(monetary.has(field)){
  const cents=toCents(value??0);
  if(cents==null||cents<0)throw failure("Invalid treatment amount.");
  return asPgMoney(cents);
 }
 return value;
}
export async function listPostgresTreatments(client,patientId=null) {
 const filter=patientId?" WHERE t.patient_id=$1":"";
 const {rows}=await client.query(`${queryBase}${filter} ORDER BY t.treatment_date DESC,t.treatment_id DESC`,patientId?[patientId]:[]);
 return rows.map(decorate);
}
export async function getPostgresTreatment(client,treatmentId) {
 const {rows}=await client.query(`${queryBase} WHERE t.treatment_id=$1`,[treatmentId]);
 return decorate(rows[0]);
}
export async function createPostgresTreatmentOnClient(client,treatment,now=new Date().toISOString()){
 const initialCents=toCents(treatment.amount_paid??0);
 const dueCents=toCents(treatment.net_amount_due);
 if(initialCents==null||dueCents==null||initialCents<0||initialCents>dueCents)throw failure("Initial payment cannot exceed amount due.");
 const method=treatment.initial_payment_method||"Not recorded";
 if(initialCents>0&&method!=="Not recorded"&&!paymentMethods.includes(method))throw failure("Select a valid initial payment method.");
  const cols=[...fields,"created_at","updated_at"];
  const values=fields.map(f=>valueFor(f,treatment)).concat([now,now]);
  await client.query(`INSERT INTO public.treatments (${cols.join(",")}) VALUES (${cols.map((_,i)=>"$"+(i+1)).join(",")})`,values);
  if(initialCents>0){
   await client.query(`INSERT INTO public.treatment_payments
    (treatment_id,amount_cents,payment_date,payment_method,reference,notes,source,created_at)
    VALUES ($1,$2,$3,$4,'','','initial',$5)`,
    [treatment.treatment_id,initialCents,treatment.treatment_date,method,now]);
  }
  return getPostgresTreatment(client,treatment.treatment_id);
}
export async function createPostgresTreatment(pool,treatment,now=new Date().toISOString()){
 return withPostgresTransaction(client=>createPostgresTreatmentOnClient(client,treatment,now),pool);
}
export async function updatePostgresTreatment(pool,treatmentId,treatment,now=new Date().toISOString()){
 return withPostgresTransaction(async client=>{
  const lock=await client.query("SELECT patient_id FROM public.treatments WHERE treatment_id=$1 FOR UPDATE",[treatmentId]);
  if(!lock.rows.length)throw failure("Treatment not found.",404);
  if(lock.rows[0].patient_id!==treatment.patient_id)throw failure("Cannot change the patient linked to an existing treatment.");
  const paid=await client.query("SELECT COALESCE(SUM(amount_cents),0)::text AS total FROM public.treatment_payments WHERE treatment_id=$1",[treatmentId]);
  const paidCents=fromPgCents(paid.rows[0].total);
  const dueCents=toCents(treatment.net_amount_due);
  if(dueCents==null||dueCents<paidCents)throw failure("Net Amount Due cannot be below payments already received.");
  const updated={...treatment,amount_paid:Number(asPgMoney(paidCents)),balance:Number(asPgMoney(dueCents-paidCents))};
  const mutable=fields.filter(f=>!["treatment_id","patient_id"].includes(f));
  const values=mutable.map(f=>valueFor(f,updated));
  await client.query(`UPDATE public.treatments SET ${mutable.map((f,i)=>f+"=$"+(i+1)).join(",")},updated_at=$${values.length+1} WHERE treatment_id=$${values.length+2}`,
   [...values,now,treatmentId]);
  return getPostgresTreatment(client,treatmentId);
 },pool);
}
