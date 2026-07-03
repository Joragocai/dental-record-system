const mobilePattern = /^[0-9+\-\s()]{7,20}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function calculateAgeFromBirthday(birthday) {
  if (!birthday) return "";
  const birthDate = new Date(birthday);
  if (Number.isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age >= 0 ? age : "";
}

function isValidDateString(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && value === date.toISOString().slice(0, 10);
}

function isFutureDate(value) {
  if (!value || !isValidDateString(value)) return false;
  return value > new Date().toISOString().slice(0, 10);
}

function trimValue(value) {
  return typeof value === "string" ? value.trim() : value;
}

export function validatePatientForm(form) {
  const errors = {};
  const normalized = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, trimValue(value)]));
  normalized.age = Number(calculateAgeFromBirthday(normalized.birthday) || 0);

  if (!/^P-\d{4}-\d{4}$/.test(normalized.patient_id || "")) errors.patient_id = "Patient ID format must be P-YYYY-0001.";
  if (!isValidDateString(normalized.date_registered)) errors.date_registered = "Date Registered is required.";
  if (isFutureDate(normalized.date_registered)) errors.date_registered = "Date Registered cannot be in the future.";
  if (!normalized.last_name) errors.last_name = "Last Name is required.";
  if (!normalized.first_name) errors.first_name = "First Name is required.";
  if (!isValidDateString(normalized.birthday)) errors.birthday = "Birthday is required.";
  if (isFutureDate(normalized.birthday)) errors.birthday = "Birthday cannot be in the future.";
  if (!normalized.gender) errors.gender = "Gender is required.";
  if (!normalized.mobile_number) errors.mobile_number = "Mobile Number is required.";
  if (normalized.mobile_number && !mobilePattern.test(normalized.mobile_number)) errors.mobile_number = "Use digits and phone symbols only.";
  if (normalized.email_address && !emailPattern.test(normalized.email_address)) errors.email_address = "Email Address is not valid.";
  if (normalized.insurance_effective_date && !isValidDateString(normalized.insurance_effective_date)) errors.insurance_effective_date = "Insurance Effective Date is not valid.";
  if (normalized.last_dental_visit && !isValidDateString(normalized.last_dental_visit)) errors.last_dental_visit = "Last Dental Visit is not valid.";
  if (normalized.is_minor === "Yes" && !normalized.parent_guardian_name) errors.parent_guardian_name = "Parent/Guardian Name is required for a minor.";
  if (normalized.under_medical_treatment === "Yes" && !normalized.medical_treatment_details) errors.medical_treatment_details = "Provide medical treatment details.";
  if (normalized.serious_illness_history === "Yes" && !normalized.serious_illness_details) errors.serious_illness_details = "Provide serious illness or operation details.";
  if (normalized.hospitalized_history === "Yes" && !normalized.hospitalization_details) errors.hospitalization_details = "Provide hospitalization details.";
  if (normalized.taking_medications === "Yes" && !normalized.medication_details) errors.medication_details = "Provide medication details.";
  if (normalized.allergy_local_anesthetic === "Yes" && !normalized.local_anesthetic_details) errors.local_anesthetic_details = "Provide local anesthetic details.";
  if (normalized.allergy_others === "Yes" && !normalized.allergy_others_details) errors.allergy_others_details = "Provide other allergy details.";
  if (normalized.other_medical_condition === "Yes" && !normalized.other_medical_condition_details) errors.other_medical_condition_details = "Provide other medical condition details.";

  return { errors, normalized, isValid: Object.keys(errors).length === 0 };
}

export function validateTreatmentForm(form, selectedPatient) {
  const errors = {};
  const normalized = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, trimValue(value)]));
  normalized.amount_charged = normalized.amount_charged === "" ? 0 : Number(normalized.amount_charged);
  normalized.amount_paid = normalized.amount_paid === "" ? 0 : Number(normalized.amount_paid);

  if (!selectedPatient?.patient_id) errors.patient_id = "Select a patient first.";
  if (!/^T-\d{4}-\d{4}$/.test(normalized.treatment_id || "")) errors.treatment_id = "Treatment ID format must be T-YYYY-0001.";
  if (!isValidDateString(normalized.treatment_date)) errors.treatment_date = "Treatment Date is required.";
  if (isFutureDate(normalized.treatment_date)) errors.treatment_date = "Treatment Date cannot be in the future.";
  if (normalized.next_appointment && !isValidDateString(normalized.next_appointment)) errors.next_appointment = "Next Appointment date is not valid.";
  if (normalized.next_appointment && normalized.treatment_date && normalized.next_appointment < normalized.treatment_date) errors.next_appointment = "Next Appointment cannot be earlier than Treatment Date.";
  if (!normalized.procedure) errors.procedure = "Procedure is required.";
  if (!normalized.dentists) errors.dentists = "Dentist/s is required.";
  if (Number.isNaN(normalized.amount_charged) || normalized.amount_charged < 0) errors.amount_charged = "Amount Charged must be 0 or greater.";
  if (Number.isNaN(normalized.amount_paid) || normalized.amount_paid < 0) errors.amount_paid = "Amount Paid must be 0 or greater.";
  if (!errors.amount_charged && !errors.amount_paid && normalized.amount_paid > normalized.amount_charged) errors.amount_paid = "Amount Paid cannot be greater than Amount Charged.";

  normalized.balance = (normalized.amount_charged - normalized.amount_paid).toFixed(2);

  return { errors, normalized, isValid: Object.keys(errors).length === 0 };
}
