import { buildDemoSeedData } from "./demoSeedData.js";
import { validateDemoSeedFixture, buildDemoTreatmentPayload } from "./demoSeedValidation.js";
import { validatePatientPayload, validateTreatmentPayload, validateAppointmentPayload } from "../utils/validation.js";
import { allocatePublicId } from "../db/postgres/publicIds.js";
import { createPostgresPatient } from "../db/postgres/patientMutations.js";
import { createPostgresTreatmentOnClient } from "../db/postgres/treatments.js";
import { createPostgresAppointment } from "../db/postgres/appointments.js";

export function prepareFictionalDemoFixture(anchorDate) {
  return validateDemoSeedFixture(buildDemoSeedData(anchorDate));
}
function verified(result, kind) {
  if (result.errors?.length) throw new Error("Invalid fictional " + kind + " fixture: " + result.errors.join("; "));
  return result.data;
}
export async function seedFictionalClinicalRows(client, anchorDate) {
  const demo = prepareFictionalDemoFixture(anchorDate);
  const patientMap = new Map();
  const treatmentMap = new Map();
  const year = Number(anchorDate.slice(0, 4));
  for (const patientSeed of demo.patients) {
    const id = await allocatePublicId(client, "P", year);
    const date = demo.addDays(anchorDate, patientSeed.date_registered_offset);
    const data = verified(validatePatientPayload({
      ...patientSeed, patient_id: id, date_registered: date
    }), "patient");
    const patient = await createPostgresPatient(client, data, date + "T09:00:00+08:00");
    patientMap.set(patientSeed.key, patient);
  }
  for (const treatmentSeed of demo.treatments) {
    const patient = patientMap.get(treatmentSeed.patientKey);
    if (!patient) throw new Error("Missing fictional patient reference.");
    const id = await allocatePublicId(client, "T", year);
    const data = verified(validateTreatmentPayload(buildDemoTreatmentPayload(treatmentSeed, {
      patientId: patient.patient_id, treatmentId: id, anchorDate, addDays: demo.addDays
    })), "treatment");
    const date = demo.addDays(anchorDate, treatmentSeed.dateOffset);
    const treatment = await createPostgresTreatmentOnClient(client, data, date + "T10:00:00+08:00");
    treatmentMap.set(treatmentSeed.key, treatment);
  }
  for (const appointmentSeed of demo.appointments) {
    const patient = patientMap.get(appointmentSeed.patientKey);
    if (!patient) throw new Error("Missing fictional appointment reference.");
    const date = demo.addDays(anchorDate, appointmentSeed.dateOffset);
    const data = verified(validateAppointmentPayload({
      patient_id: patient.patient_id, appointment_date: date,
      appointment_time: appointmentSeed.appointment_time,
      planned_procedure: appointmentSeed.planned_procedure,
      notes: appointmentSeed.notes, status: appointmentSeed.status
    }), "appointment");
    await createPostgresAppointment(client, data, date + "T11:00:00+08:00");
  }
  return { demo, patientMap, treatmentMap };
}
