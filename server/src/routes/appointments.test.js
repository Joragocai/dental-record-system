import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.TZ = "UTC";

const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dental-appointment-route-"));
process.env.DENTAL_DB_PATH = path.join(runtimeRoot, "data", "appointments.db");
process.env.DENTAL_UPLOAD_ROOT = path.join(runtimeRoot, "uploads");
process.env.DENTAL_EXPORT_ROOT = path.join(runtimeRoot, "exports");
process.env.DENTAL_BACKUP_ROOT = path.join(runtimeRoot, "backups");
process.env.DENTAL_AUTO_BACKUP_ENABLED = "false";
process.env.DENTAL_APP_MODE = "clean";

const [databaseModule, patientServiceModule, appointmentServiceModule, appointmentsRouteModule] = await Promise.all([
  import("../db/database.js"),
  import("../services/patientService.js"),
  import("../services/appointmentService.js"),
  import("./appointments.js")
]);

const { default: db, initializeDatabase } = databaseModule;
const { createPatient } = patientServiceModule;
const { createAppointment } = appointmentServiceModule;
const { default: appointmentsRouter } = appointmentsRouteModule;

initializeDatabase();

test.after(async () => {
  db.close();
  await fs.rm(runtimeRoot, { recursive: true, force: true });
});

function resetRuntimeState() {
  db.exec(`
    DELETE FROM appointments;
    DELETE FROM treatments;
    DELETE FROM attachments;
    DELETE FROM patients;
  `);
}

function buildPatientPayload(overrides = {}) {
  return {
    patient_id: "P-2026-0001",
    date_registered: "2026-08-16",
    last_name: "Rivera",
    first_name: "Alicia",
    middle_name: "",
    birthday: "1990-02-14",
    age: 36,
    gender: "Female",
    religion: "",
    nationality: "Filipino",
    nickname: "",
    patient_occupation: "",
    dental_insurance: "",
    insurance_effective_date: "",
    previous_dentist: "",
    last_dental_visit: "",
    mobile_number: "09170000001",
    email_address: "alicia@example.test",
    branch_location: "Main Branch",
    discount_eligibility: "None",
    home_address: "123 Sample Street",
    home_number: "",
    office_number: "",
    fax_number: "",
    is_minor: "No",
    parent_guardian_name: "",
    parent_guardian_occupation: "",
    referral_source: "",
    reason_for_consultation: "",
    good_health: "Yes",
    under_medical_treatment: "No",
    medical_treatment_details: "",
    serious_illness_history: "No",
    serious_illness_details: "",
    hospitalized_history: "No",
    hospitalization_details: "",
    taking_medications: "No",
    medication_details: "",
    uses_tobacco: "No",
    uses_alcohol_or_drugs: "No",
    disability_type: "",
    pregnant: "No",
    nursing: "No",
    birth_control_pills: "No",
    physician_name: "",
    physician_specialty: "",
    physician_office_number: "",
    physician_office_address: "",
    allergic_to_items: "No",
    blood_type: "O+",
    blood_pressure: "120/80",
    allergy_local_anesthetic: "No",
    local_anesthetic_details: "",
    allergy_penicillin: "No",
    allergy_sulfa: "No",
    allergy_aspirin: "No",
    allergy_latex: "No",
    allergy_others: "No",
    allergy_others_details: "",
    condition_high_blood_pressure: 0,
    condition_low_blood_pressure: 0,
    condition_epilepsy_convulsions: 0,
    condition_aids_hiv: 0,
    condition_std: 0,
    condition_stomach_troubles: 0,
    condition_fainting_seizure: 0,
    condition_rapid_weight_loss: 0,
    condition_radiation_therapy: 0,
    condition_joint_replacement: 0,
    condition_heart_surgery: 0,
    condition_heart_attack: 0,
    condition_thyroid_problem: 0,
    condition_heart_disease: 0,
    condition_heart_murmur: 0,
    condition_hepatitis_liver_disease: 0,
    condition_rheumatic_fever: 0,
    condition_hay_fever_allergies: 0,
    condition_respiratory_problems: 0,
    condition_hepatitis_jaundice: 0,
    condition_tuberculosis: 0,
    condition_swollen_ankles: 0,
    condition_kidney_disease: 0,
    condition_diabetes: 0,
    condition_chest_pain: 0,
    condition_stroke: 0,
    condition_cancer_tumors: 0,
    condition_anemia: 0,
    condition_angina: 0,
    condition_asthma: 0,
    condition_emphysema: 0,
    condition_bleeding_problems: 0,
    condition_blood_diseases: 0,
    condition_head_injuries: 0,
    condition_arthritis_rheumatism: 0,
    other_medical_condition: "No",
    other_medical_condition_details: "",
    medical_alert_summary: "",
    ...overrides
  };
}

function buildAppointmentPayload(overrides = {}) {
  return {
    patient_id: "P-2026-0001",
    appointment_date: "2026-08-20",
    appointment_time: "10:00",
    planned_procedure: "Cleaning",
    notes: "Initial note",
    status: "Scheduled",
    ...overrides
  };
}

function getRouteHandler(method, routePath) {
  const layer = appointmentsRouter.stack.find(
    (entry) => entry.route?.path === routePath && entry.route.methods?.[method]
  );

  if (!layer) {
    throw new Error(`Unable to find ${method.toUpperCase()} ${routePath}`);
  }

  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test("appointments routes preserve get, validation, and status-update behavior", () => {
  resetRuntimeState();
  createPatient(buildPatientPayload(), "2026-08-16T08:00:00.000Z");
  const created = createAppointment(buildAppointmentPayload(), "2026-08-16T08:05:00.000Z");

  const getHandler = getRouteHandler("get", "/:appointmentId");
  const patchHandler = getRouteHandler("patch", "/:appointmentId");
  const statusHandler = getRouteHandler("patch", "/:appointmentId/status");

  const getResponse = createResponse();
  getHandler({ params: { appointmentId: String(created.id) } }, getResponse);
  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.body.id, created.id);
  assert.equal(getResponse.body.patient_name, "Rivera, Alicia");

  const invalidResponse = createResponse();
  patchHandler(
    {
      params: { appointmentId: String(created.id) },
      body: { appointment_time: "99:99" }
    },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(invalidResponse.body.message, "Appointment Time must be a valid time.");

  const statusResponse = createResponse();
  statusHandler(
    {
      params: { appointmentId: String(created.id) },
      body: { status: "Completed" }
    },
    statusResponse
  );
  assert.equal(statusResponse.statusCode, 200);
  assert.equal(statusResponse.body.status, "Completed");
});
