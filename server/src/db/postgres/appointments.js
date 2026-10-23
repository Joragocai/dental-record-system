import { buildPatientDisplayName } from "../../utils/patientUtils.js";
import { normalizePgRow } from "./format.js";

const fields = ["patient_id", "appointment_date", "appointment_time", "planned_procedure", "notes", "status"];
const normalize = (row) => {
  const result = normalizePgRow(row);
  if (!result) return null;
  return {
    ...result,
    patient_name: result.patient_name || buildPatientDisplayName(result),
    planned_procedure: result.planned_procedure || "",
    appointment_time: result.appointment_time || "",
    notes: result.notes || "",
    status: result.status || "Scheduled"
  };
};
const joined = `SELECT a.*, p.first_name, p.middle_name, p.last_name, p.mobile_number, p.branch_location
 FROM public.appointments a
 JOIN public.patients p ON p.patient_id = a.patient_id`;
export async function listPostgresAppointments(client, patientId) {
  const { rows } = await client.query(`${joined} WHERE a.patient_id = $1
    ORDER BY a.appointment_date DESC,
      (a.appointment_time IS NULL OR btrim(a.appointment_time) = ''),
      a.appointment_time DESC, a.id DESC`, [patientId]);
  return rows.map(normalize);
}
export async function getPostgresAppointment(client, id) {
  const { rows } = await client.query(`${joined} WHERE a.id = $1`,[id]);
  return normalize(rows[0]);
}
export async function createPostgresAppointment(client, value, now = new Date().toISOString()) {
  const columns = [...fields,"created_at","updated_at"];
  const values = columns.map((field) => {
    const valueField = field === "created_at" || field === "updated_at" ? now : value[field] ?? null;
    return valueField === "" && field === "appointment_time" ? null : valueField;
  });
  const { rows } = await client.query(`INSERT INTO public.appointments
    (${columns.join(", ")}) VALUES (${values.map((_, i)=>`$${i+1}`).join(", ")}) RETURNING id`,values);
  return getPostgresAppointment(client, rows[0].id);
}
export async function updatePostgresAppointment(client,id,value,now=new Date().toISOString()) {
  const values=fields.map((field)=>field === "appointment_time" && value[field] === "" ? null : value[field] ?? null);
  const { rows } = await client.query(`UPDATE public.appointments SET
    ${fields.map((field,i)=>`${field} = $${i+1}`).join(", ")},
    updated_at = $${values.length+1} WHERE id = $${values.length+2} RETURNING id`,
    [...values,now,id]);
  return rows.length ? getPostgresAppointment(client,id) : null;
}
export async function updatePostgresAppointmentStatus(client,id,status,now=new Date().toISOString()) {
  const { rows } = await client.query(
    "UPDATE public.appointments SET status = $1, updated_at = $2 WHERE id = $3 RETURNING id",
    [status,now,id]);
  return rows.length ? getPostgresAppointment(client,id) : null;
}
