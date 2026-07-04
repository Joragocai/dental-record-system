import { buildMedicalAlertSummary } from "./patientUtils.js";

const mobilePattern = /^[0-9+\-\s()]{7,20}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const patientIdPattern = /^P-\d{4}-\d{4}$/;
const treatmentIdPattern = /^T-\d{4}-\d{4}$/;

const patientConditionFields = [
  "condition_high_blood_pressure",
  "condition_low_blood_pressure",
  "condition_epilepsy_convulsions",
  "condition_aids_hiv",
  "condition_std",
  "condition_stomach_troubles",
  "condition_fainting_seizure",
  "condition_rapid_weight_loss",
  "condition_radiation_therapy",
  "condition_joint_replacement",
  "condition_heart_surgery",
  "condition_heart_attack",
  "condition_thyroid_problem",
  "condition_heart_disease",
  "condition_heart_murmur",
  "condition_hepatitis_liver_disease",
  "condition_rheumatic_fever",
  "condition_hay_fever_allergies",
  "condition_respiratory_problems",
  "condition_hepatitis_jaundice",
  "condition_tuberculosis",
  "condition_swollen_ankles",
  "condition_kidney_disease",
  "condition_diabetes",
  "condition_chest_pain",
  "condition_stroke",
  "condition_cancer_tumors",
  "condition_anemia",
  "condition_angina",
  "condition_asthma",
  "condition_emphysema",
  "condition_bleeding_problems",
  "condition_blood_diseases",
  "condition_head_injuries",
  "condition_arthritis_rheumatism"
];

function cleanString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function isValidDateString(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && value === date.toISOString().slice(0, 10);
}

function isFutureDate(value) {
  return isValidDateString(value) && value > new Date().toISOString().slice(0, 10);
}

function calculateAge(birthday) {
  if (!isValidDateString(birthday)) return 0;
  const birthDate = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return Math.max(age, 0);
}

function parseAmount(value) {
  if (value === undefined || value === null) return { isBlank: true, numberValue: null };
  if (typeof value === "string" && value.trim() === "") return { isBlank: true, numberValue: null };

  const numberValue = Number(value);
  return { isBlank: false, numberValue };
}

export function validatePatientPayload(input) {
  const data = { ...input };
  const errors = [];

  Object.keys(data).forEach((key) => {
    if (typeof data[key] === "string") data[key] = cleanString(data[key]);
  });

  patientConditionFields.forEach((field) => {
    data[field] = Number(data[field] || 0) ? 1 : 0;
  });

  data.patient_id = cleanString(data.patient_id);
  data.date_registered = cleanString(data.date_registered);
  data.last_name = cleanString(data.last_name);
  data.first_name = cleanString(data.first_name);
  data.middle_name = cleanString(data.middle_name);
  data.birthday = cleanString(data.birthday);
  data.gender = cleanString(data.gender);
  data.mobile_number = cleanString(data.mobile_number);
  data.email_address = cleanString(data.email_address);
  data.is_minor = cleanString(data.is_minor) || "No";
  data.medical_alert_summary = cleanString(data.medical_alert_summary);

  if (!patientIdPattern.test(data.patient_id)) errors.push("Patient ID format must be P-YYYY-0001.");
  if (!isValidDateString(data.date_registered)) errors.push("Date Registered is required and must be valid.");
  if (isFutureDate(data.date_registered)) errors.push("Date Registered cannot be in the future.");
  if (!data.last_name) errors.push("Last Name is required.");
  if (!data.first_name) errors.push("First Name is required.");
  if (!isValidDateString(data.birthday)) errors.push("Birthday is required and must be valid.");
  if (isFutureDate(data.birthday)) errors.push("Birthday cannot be in the future.");
  if (!data.gender) errors.push("Gender is required.");
  if (!data.mobile_number) errors.push("Mobile Number is required.");
  if (data.mobile_number && !mobilePattern.test(data.mobile_number)) errors.push("Mobile Number format is not valid.");
  if (data.email_address && !emailPattern.test(data.email_address)) errors.push("Email Address is not valid.");
  if (data.insurance_effective_date && !isValidDateString(data.insurance_effective_date)) errors.push("Insurance Effective Date must be valid.");
  if (data.last_dental_visit && !isValidDateString(data.last_dental_visit)) errors.push("Last Dental Visit must be valid.");
  if (data.is_minor === "Yes" && !cleanString(data.parent_guardian_name)) errors.push("Parent/Guardian Name is required when Is Minor is Yes.");
  if (data.under_medical_treatment === "Yes" && !cleanString(data.medical_treatment_details)) errors.push("Medical Treatment Details are required.");
  if (data.serious_illness_history === "Yes" && !cleanString(data.serious_illness_details)) errors.push("Serious Illness / Operation Details are required.");
  if (data.hospitalized_history === "Yes" && !cleanString(data.hospitalization_details)) errors.push("Hospitalization Details are required.");
  if (data.taking_medications === "Yes" && !cleanString(data.medication_details)) errors.push("Medication Details are required.");
  if (data.allergy_local_anesthetic === "Yes" && !cleanString(data.local_anesthetic_details)) errors.push("Local Anesthetic Details are required.");
  if (data.allergy_others === "Yes" && !cleanString(data.allergy_others_details)) errors.push("Allergy Others Details are required.");
  if (data.other_medical_condition === "Yes" && !cleanString(data.other_medical_condition_details)) errors.push("Other Medical Condition Details are required.");

  data.age = calculateAge(data.birthday);
  data.medical_alert_summary = data.medical_alert_summary || buildMedicalAlertSummary(data);

  return { errors, data };
}

export function validateTreatmentPayload(input) {
  const data = { ...input };
  const errors = [];

  Object.keys(data).forEach((key) => {
    if (typeof data[key] === "string") data[key] = cleanString(data[key]);
  });

  data.treatment_id = cleanString(data.treatment_id);
  data.patient_id = cleanString(data.patient_id);
  data.treatment_date = cleanString(data.treatment_date);
  data.next_appointment = cleanString(data.next_appointment);
  data.procedure = cleanString(data.procedure);
  data.dentists = cleanString(data.dentists);
  data.tooth_numbers = cleanString(data.tooth_numbers);
  data.remarks = cleanString(data.remarks);
  const amountCharged = parseAmount(data.amount_charged);
  const amountPaid = parseAmount(data.amount_paid);
  const balance = parseAmount(data.balance);

  if (!treatmentIdPattern.test(data.treatment_id)) errors.push("Treatment ID format must be T-YYYY-0001.");
  if (!data.patient_id) errors.push("Patient ID is required.");
  if (!isValidDateString(data.treatment_date)) errors.push("Treatment Date is required and must be valid.");
  if (isFutureDate(data.treatment_date)) errors.push("Treatment Date cannot be in the future.");
  if (data.next_appointment && !isValidDateString(data.next_appointment)) errors.push("Next Appointment must be a valid date.");
  if (data.next_appointment && data.treatment_date && data.next_appointment < data.treatment_date) errors.push("Next Appointment cannot be earlier than Treatment Date.");
  if (!data.procedure) errors.push("Procedure is required.");
  if (!data.dentists) errors.push("Dentist/s is required.");
  if (amountCharged.isBlank) {
    errors.push("Amount Charged is required.");
  } else if (Number.isNaN(amountCharged.numberValue) || amountCharged.numberValue < 0) {
    errors.push("Amount Charged must be a valid number that is 0 or greater.");
  }
  if (amountPaid.isBlank) {
    errors.push("Amount Paid is required.");
  } else if (Number.isNaN(amountPaid.numberValue) || amountPaid.numberValue < 0) {
    errors.push("Amount Paid must be a valid number that is 0 or greater.");
  }
  if (balance.isBlank) {
    errors.push("Balance is required.");
  } else if (Number.isNaN(balance.numberValue)) {
    errors.push("Balance must be a valid number.");
  }

  if (
    !amountCharged.isBlank &&
    !amountPaid.isBlank &&
    !Number.isNaN(amountCharged.numberValue) &&
    !Number.isNaN(amountPaid.numberValue) &&
    amountCharged.numberValue >= 0 &&
    amountPaid.numberValue >= 0
  ) {
    if (amountPaid.numberValue > amountCharged.numberValue) {
      errors.push("Amount Paid cannot be greater than Amount Charged.");
    }

    const computedBalance = Number((amountCharged.numberValue - amountPaid.numberValue).toFixed(2));
    if (!balance.isBlank && !Number.isNaN(balance.numberValue) && Number(balance.numberValue.toFixed(2)) !== computedBalance) {
      errors.push("Balance must equal Amount Charged minus Amount Paid.");
    }

    data.amount_charged = Number(amountCharged.numberValue.toFixed(2));
    data.amount_paid = Number(amountPaid.numberValue.toFixed(2));
    data.balance = computedBalance;
  }

  return { errors, data };
}
