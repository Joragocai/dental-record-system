import { buildPatientDisplayName } from "../../utils/patientUtils.js";
import { normalizePgRow } from "./format.js";
import { getManilaIsoDate, buildTodayScheduleMetrics, getBirthdayReminders } from "../../services/dashboardService.js";
import { listPostgresPatients } from "./patients.js";
import { listPostgresTreatments } from "./treatments.js";

export const scheduleQuery = `SELECT * FROM (
 SELECT CASE WHEN a.origin_treatment_id IS NOT NULL THEN 'treatment_follow_up' ELSE 'appointment' END AS source_type,a.id AS source_id,a.origin_treatment_id AS treatment_record_id,
 a.patient_id,p.patient_id AS patient_system_id,p.first_name,p.middle_name,p.last_name,
 p.mobile_number,p.branch_location,a.appointment_date AS schedule_date,a.appointment_time,
 a.planned_procedure AS procedure_label,a.status
 FROM public.appointments a JOIN public.patients p ON p.patient_id=a.patient_id
 WHERE ($2::boolean OR a.status='Scheduled')
 UNION ALL
 SELECT 'treatment_follow_up' AS source_type,t.id AS source_id,
 t.treatment_id AS treatment_record_id,t.patient_id,p.patient_id AS patient_system_id,
 p.first_name,p.middle_name,p.last_name,p.mobile_number,p.branch_location,
 t.next_appointment_date AS schedule_date,t.next_appointment_time AS appointment_time,
 t.procedure AS procedure_label,''::text AS status
 FROM public.treatments t JOIN public.patients p ON p.patient_id=t.patient_id
 WHERE t.next_appointment_date IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.origin_treatment_id=t.treatment_id)
) scheduled WHERE schedule_date ${"$DATE_OPERATOR"} $1::date
 ORDER BY schedule_date ASC,(appointment_time IS NULL OR btrim(appointment_time)='') ASC,
 appointment_time ASC,last_name ASC,first_name ASC`;

export async function getPostgresScheduleRows(client,date,{includeToday=false,exactDate=false,includeOtherStatuses=false}={}){
 const operator=exactDate||includeToday?"=":">";
 const {rows}=await client.query(scheduleQuery.replace("$DATE_OPERATOR",operator),[date,includeOtherStatuses]);
 return rows.map(raw=>{
  const item=normalizePgRow(raw);
  item.schedule_date=item.schedule_date instanceof Date?item.schedule_date.toISOString().slice(0,10):String(item.schedule_date);
  return {...item,patient_name:buildPatientDisplayName(item),appointment_time:item.appointment_time||"",
   procedure_label:String(item.procedure_label||"").trim()||"General Appointment",
   status:item.status||"",
   source_label:item.source_type==="appointment"?"Scheduled Appointment":"Follow-up from Treatment"};
 });
}
export async function getPostgresDashboardSummary(client,now=new Date()){
 const today=getManilaIsoDate(now);
 const [patients,treatments,entries]=await Promise.all([
  listPostgresPatients(client),listPostgresTreatments(client),
  getPostgresScheduleRows(client,today,{includeToday:true})
 ]);
 const latestPatients=[...patients].sort((a,b)=>String(b.created_at||b.date_registered||"")
  .localeCompare(String(a.created_at||a.date_registered||""))).slice(0,20);
 return {totalPatientRecords:patients.length,latestPatients,latestTreatments:treatments.slice(0,5),
  todaySchedule:buildTodayScheduleMetrics(entries,today),
  birthdayReminders:getBirthdayReminders(patients,now)};
}
