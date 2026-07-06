import db from "../db/database.js";
import { buildMedicalAlertSummary, buildPatientDisplayName } from "../utils/patientUtils.js";

const patientFields = [
  "patient_id", "date_registered", "last_name", "first_name", "middle_name", "birthday", "age", "gender", "religion",
  "nationality", "nickname", "patient_occupation", "dental_insurance", "insurance_effective_date", "previous_dentist",
  "last_dental_visit", "mobile_number", "email_address", "branch_location", "discount_eligibility", "home_address", "home_number", "office_number", "fax_number",
  "is_minor", "parent_guardian_name", "parent_guardian_occupation", "referral_source", "reason_for_consultation",
  "good_health", "under_medical_treatment", "medical_treatment_details", "serious_illness_history", "serious_illness_details",
  "hospitalized_history", "hospitalization_details", "taking_medications", "medication_details", "uses_tobacco",
  "uses_alcohol_or_drugs", "disability_type", "pregnant", "nursing", "birth_control_pills", "physician_name", "physician_specialty",
  "physician_office_number", "physician_office_address", "allergic_to_items", "blood_type", "blood_pressure",
  "allergy_local_anesthetic", "local_anesthetic_details", "allergy_penicillin", "allergy_sulfa", "allergy_aspirin",
  "allergy_latex", "allergy_others", "allergy_others_details", "condition_high_blood_pressure", "condition_low_blood_pressure",
  "condition_epilepsy_convulsions", "condition_aids_hiv", "condition_std", "condition_stomach_troubles",
  "condition_fainting_seizure", "condition_rapid_weight_loss", "condition_radiation_therapy", "condition_joint_replacement",
  "condition_heart_surgery", "condition_heart_attack", "condition_thyroid_problem", "condition_heart_disease",
  "condition_heart_murmur", "condition_hepatitis_liver_disease", "condition_rheumatic_fever", "condition_hay_fever_allergies",
  "condition_respiratory_problems", "condition_hepatitis_jaundice", "condition_tuberculosis", "condition_swollen_ankles",
  "condition_kidney_disease", "condition_diabetes", "condition_chest_pain", "condition_stroke", "condition_cancer_tumors",
  "condition_anemia", "condition_angina", "condition_asthma", "condition_emphysema", "condition_bleeding_problems",
  "condition_blood_diseases", "condition_head_injuries", "condition_arthritis_rheumatism", "other_medical_condition",
  "other_medical_condition_details", "medical_alert_summary"
];

function normalizePatient(patient) {
  const next = { ...patient };
  next.medical_alert_summary = buildMedicalAlertSummary(next);
  return next;
}

function decoratePatient(row) {
  return row
    ? {
        ...row,
        medical_alert_summary: buildMedicalAlertSummary(row),
        display_name: buildPatientDisplayName(row)
      }
    : null;
}

export function listPatients() {
  const rows = db.prepare("SELECT * FROM patients ORDER BY last_name, first_name, middle_name").all();
  return rows.map(decoratePatient);
}

export function searchPatients(query) {
  const value = `%${query.trim()}%`;
  const rows = db
    .prepare(
      `SELECT * FROM patients
       WHERE last_name LIKE ?
          OR first_name LIKE ?
          OR patient_id LIKE ?
          OR mobile_number LIKE ?
       ORDER BY last_name, first_name, middle_name`
    )
    .all(value, value, value, value);
  return rows.map(decoratePatient);
}

export function getPatientByPatientId(patientId) {
  const row = db.prepare("SELECT * FROM patients WHERE patient_id = ?").get(patientId);
  return decoratePatient(row);
}

export function createPatient(patient, now) {
  const normalized = normalizePatient(patient);
  const fields = [...patientFields, "created_at", "updated_at"];
  const values = fields.map((field) => (field === "created_at" || field === "updated_at" ? now : normalized[field] ?? null));
  const placeholders = fields.map(() => "?").join(", ");
  db.prepare(`INSERT INTO patients (${fields.join(", ")}) VALUES (${placeholders})`).run(...values);
  return getPatientByPatientId(normalized.patient_id);
}

export function updatePatient(patientId, patient, now) {
  const normalized = normalizePatient(patient);
  const assignments = patientFields.map((field) => `${field} = ?`).join(", ");
  const values = patientFields.map((field) => normalized[field] ?? null);
  db.prepare(`UPDATE patients SET ${assignments}, updated_at = ? WHERE patient_id = ?`).run(...values, now, patientId);
  return getPatientByPatientId(patientId);
}
