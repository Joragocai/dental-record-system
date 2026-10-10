import type {PgQueryExecutor} from "../postgres/pool.js";
import {normalizePgDateOnly} from "../postgres/dateOnly.js";
export function createPortalRecordsRepository(db:PgQueryExecutor) {
 return {
  async profile(patientId:string) {
   const q=await db.query<{patient_code:string;first_name:string;last_name:string;mobile_number:string;home_address:string|null}>("SELECT patient_code,first_name,last_name,mobile_number,home_address FROM patients WHERE id=$1",[patientId]);
   const x=q.rows[0];return x?{patientCode:x.patient_code,firstName:x.first_name,lastName:x.last_name,mobileNumber:x.mobile_number,homeAddress:x.home_address}:null;
  },
  async updateContact(patientId:string,mobile:string,address:string|null) {
   const q=await db.query("UPDATE patients SET mobile_number=$2,home_address=$3,updated_at=NOW() WHERE id=$1",[patientId,mobile,address]);
   return q.rowCount===1;
  },
  async treatments(patientId:string) {
   const q=await db.query<{treatment_code:string;treatment_date:Date|string;patient_portal_summary:string}>(
    "SELECT treatment_code,treatment_date,patient_portal_summary FROM treatments WHERE patient_id=$1 AND patient_visible=TRUE ORDER BY treatment_date DESC,id DESC LIMIT 100",[patientId]);
   return q.rows.map(x=>({code:x.treatment_code,date:normalizePgDateOnly(x.treatment_date,"treatment date"),summary:x.patient_portal_summary}));
  },
  async appointments(patientId:string) {
   const q=await db.query<{id:string;appointment_date:string|Date;appointment_time:string|null;status:string;branch_name:string}>(
    "SELECT a.id,a.appointment_date,a.appointment_time,a.status,b.branch_name FROM appointments a JOIN branches b ON b.id=a.branch_id WHERE a.patient_id=$1 ORDER BY a.appointment_date DESC,a.id DESC LIMIT 100",[patientId]);
   return q.rows.map(x=>({id:x.id,date:normalizePgDateOnly(x.appointment_date,"appointment date"),time:x.appointment_time,status:x.status,branchName:x.branch_name}));
  },
  async treatmentForUpdate(treatmentId:string) {
   const q=await db.query<{id:string;patient_id:string;branch_id:string}>(
    "SELECT t.id,t.patient_id,t.branch_id FROM treatments t WHERE t.id=$1 FOR UPDATE OF t",[treatmentId]);
   return q.rows[0]??null;
  },
  async publish(treatmentId:string,summary:string,actorUserId:string) {
   const q=await db.query("UPDATE treatments SET patient_visible=TRUE,patient_portal_summary=$2,patient_published_at=NOW(),patient_published_by=$3,updated_at=NOW() WHERE id=$1",[treatmentId,summary,actorUserId]);
   return q.rowCount===1;
  }
 };
}
