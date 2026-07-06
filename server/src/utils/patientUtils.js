const checklistConditionFields = [
  ["condition_high_blood_pressure", "High Blood Pressure"],
  ["condition_low_blood_pressure", "Low Blood Pressure"],
  ["condition_epilepsy_convulsions", "Epilepsy / Convulsions"],
  ["condition_aids_hiv", "AIDS or HIV Infection"],
  ["condition_std", "Sexually Transmitted Disease"],
  ["condition_stomach_troubles", "Stomach Troubles / Ulcers"],
  ["condition_fainting_seizure", "Fainting Seizure"],
  ["condition_rapid_weight_loss", "Rapid Weight Loss"],
  ["condition_radiation_therapy", "Radiation Therapy"],
  ["condition_joint_replacement", "Joint Replacement / Implant"],
  ["condition_heart_surgery", "Heart Surgery"],
  ["condition_heart_attack", "Heart Attack"],
  ["condition_thyroid_problem", "Thyroid Problem"],
  ["condition_heart_disease", "Heart Disease"],
  ["condition_heart_murmur", "Heart Murmur"],
  ["condition_hepatitis_liver_disease", "Hepatitis / Liver Disease"],
  ["condition_rheumatic_fever", "Rheumatic Fever"],
  ["condition_hay_fever_allergies", "Hay Fever / Allergies"],
  ["condition_respiratory_problems", "Respiratory Problems"],
  ["condition_hepatitis_jaundice", "Hepatitis / Jaundice"],
  ["condition_tuberculosis", "Tuberculosis"],
  ["condition_swollen_ankles", "Swollen Ankles"],
  ["condition_kidney_disease", "Kidney Disease"],
  ["condition_diabetes", "Diabetes"],
  ["condition_chest_pain", "Chest Pain"],
  ["condition_stroke", "Stroke"],
  ["condition_cancer_tumors", "Cancer / Tumors"],
  ["condition_anemia", "Anemia"],
  ["condition_angina", "Angina"],
  ["condition_asthma", "Asthma"],
  ["condition_emphysema", "Emphysema"],
  ["condition_bleeding_problems", "Bleeding Problems"],
  ["condition_blood_diseases", "Blood Diseases"],
  ["condition_head_injuries", "Head Injuries"],
  ["condition_arthritis_rheumatism", "Arthritis / Rheumatism"]
];

const allergyFields = [
  ["allergy_local_anesthetic", "Local Anesthetic", "local_anesthetic_details"],
  ["allergy_penicillin", "Penicillin / Antibiotics"],
  ["allergy_sulfa", "Sulfa Drugs"],
  ["allergy_aspirin", "Aspirin"],
  ["allergy_latex", "Latex"],
  ["allergy_others", "Other Allergies", "allergy_others_details"]
];

function isChecked(value) {
  return value === "Yes" || value === 1 || value === true || value === "1";
}

function hasDiscountEligibility(value) {
  const normalized = String(value || "").trim();
  return normalized && normalized !== "None";
}

function isPwdRelatedClassification(value) {
  const normalized = String(value || "").trim();
  return normalized === "PWD" || normalized === "Senior Citizen and PWD";
}

function shouldShowPatientClassificationInSummary(value) {
  const normalized = String(value || "").trim();
  return normalized === "Senior Citizen" || normalized === "PWD" || normalized === "Senior Citizen and PWD";
}

export function buildPatientDisplayName(patient) {
  return [patient.last_name, `${patient.first_name} ${patient.middle_name || ""}`.trim()]
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMedicalAlertSummary(patient) {
  const sections = [];

  const selectedConditions = checklistConditionFields
    .filter(([field]) => isChecked(patient[field]))
    .map(([, label]) => label);

  if (selectedConditions.length) {
    sections.push(`Medical conditions: ${selectedConditions.join(", ")}`);
  }

  const allergyAlerts = allergyFields
    .filter(([field]) => patient[field] === "Yes")
    .map(([, label, detailField]) => {
      const details = detailField ? String(patient[detailField] || "").trim() : "";
      return details ? `${label} (${details})` : label;
    });

  if (allergyAlerts.length) {
    sections.push(`Allergies: ${allergyAlerts.join(", ")}`);
  }

  if (patient.blood_type) {
    sections.push(`Blood Type: ${patient.blood_type}`);
  }

  if (shouldShowPatientClassificationInSummary(patient.discount_eligibility)) {
    sections.push(`Patient classification: ${patient.discount_eligibility}`);
  }

  if (isPwdRelatedClassification(patient.discount_eligibility) && patient.disability_type) {
    sections.push(`Type of disability: ${patient.disability_type}`);
  }

  if (patient.pregnant === "Yes") {
    sections.push("Pregnancy: Pregnant");
  }

  if (patient.under_medical_treatment === "Yes") {
    const details = String(patient.medical_treatment_details || "").trim();
    sections.push(`Medical Treatment: ${details || "Under medical treatment"}`);
  }

  if (patient.serious_illness_history === "Yes") {
    const details = String(patient.serious_illness_details || "").trim();
    sections.push(`Serious Illness / Operation: ${details || "History reported"}`);
  }

  if (patient.hospitalized_history === "Yes") {
    const details = String(patient.hospitalization_details || "").trim();
    sections.push(`Hospitalization: ${details || "History reported"}`);
  }

  if (patient.taking_medications === "Yes") {
    const details = String(patient.medication_details || "").trim();
    sections.push(`Medications: ${details || "Medication reported"}`);
  }

  if (patient.other_medical_condition === "Yes" && patient.other_medical_condition_details) {
    sections.push(`Other Medical Condition: ${patient.other_medical_condition_details}`);
  }

  return sections.join(" | ");
}
