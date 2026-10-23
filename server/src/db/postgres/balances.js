import { buildPatientDisplayName } from "../../utils/patientUtils.js";
import { fromPgMoneyCents, normalizePgRow, asPgMoney } from "./format.js";

const sql=`SELECT t.treatment_id,t.patient_id,t.treatment_date,t.procedure,
 t.amount_charged,t.discount_amount,t.net_amount_due,t.amount_paid,t.balance,
 p.first_name,p.middle_name,p.last_name,p.mobile_number,p.branch_location
 FROM public.treatments t JOIN public.patients p ON p.patient_id=t.patient_id
 ORDER BY t.treatment_date DESC,t.treatment_id DESC`;
const pesos=cents=>Number(asPgMoney(cents));
export async function getPostgresBalancesReport(client){
 const {rows}=await client.query(sql);
 let outstandingCents=0;
 const openPatients=new Set();
 let settledTreatments=0;
 const records=rows.map(raw=>{
  const row=normalizePgRow(raw);
  const due=fromPgMoneyCents(raw.net_amount_due);
  const paid=fromPgMoneyCents(raw.amount_paid);
  const remaining=Math.max(0,due-paid);
  if(remaining){outstandingCents+=remaining;openPatients.add(row.patient_id);}else settledTreatments++;
  return {...row,patient_name:buildPatientDisplayName(row),net_amount_due:pesos(due),
   amount_paid:pesos(paid),balance:pesos(remaining),
   payment_status:remaining===0?"Settled":paid>0?"Partially Paid":"Unpaid"};
 });
 return {summary:{outstanding_total:pesos(outstandingCents),
  treatments_with_balance:records.length-settledTreatments,
  patients_with_balance:openPatients.size,settled_treatments:settledTreatments},records};
}
export async function getPostgresPatientFinancialSummary(client,patientId){
 const {records}=await getPostgresBalancesReport(client);
 const owned=records.filter(item=>item.patient_id===patientId);
 const sum=field=>pesos(owned.reduce((total,row)=>total+fromPgMoneyCents(row[field]),0));
 return {net_due:sum("net_amount_due"),total_paid:sum("amount_paid"),outstanding:sum("balance"),
  open_treatments:owned.filter(row=>row.balance>0).length,treatment_count:owned.length};
}
