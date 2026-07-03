const riskFields = [
  ["allergy_local_anesthetic", "Local anesthetic allergy"],
  ["allergy_penicillin", "Penicillin or antibiotics allergy"],
  ["allergy_latex", "Latex allergy"],
  ["condition_diabetes", "Diabetes"],
  ["condition_high_blood_pressure", "High blood pressure"],
  ["condition_heart_disease", "Heart disease"],
  ["condition_bleeding_problems", "Bleeding problems"]
];

export function buildPatientDisplayName(patient) {
  return [patient.last_name, `${patient.first_name} ${patient.middle_name || ""}`.trim()]
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMedicalAlertSummary(patient) {
  const alerts = riskFields
    .filter(([field]) => patient[field] === "Yes" || patient[field] === 1)
    .map(([, label]) => label);
  if (patient.pregnant === "Yes") alerts.push("Pregnant");
  if (patient.other_medical_condition === "Yes" && patient.other_medical_condition_details) {
    alerts.push(patient.other_medical_condition_details);
  }
  return alerts.join(", ");
}
