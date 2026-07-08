import { isPwdRelatedClassification } from "./formatters";

const mobilePattern = /^[0-9+\-\s()]{7,20}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const treatmentDiscountDefaults = {
  None: 0,
  "Senior Citizen": 20,
  PWD: 20,
  "Senior Citizen/PWD": 20,
  Custom: 0
};

function parsePlainDate(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(year, month - 1, day);
}

export function calculateAgeFromBirthday(birthday) {
  if (!birthday) return "";
  const birthDate = parsePlainDate(birthday);
  if (!birthDate || Number.isNaN(birthDate.getTime())) return "";
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

function isValidTimeString(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || "").trim());
}

function trimValue(value) {
  return typeof value === "string" ? value.trim() : value;
}

function parseAmount(value) {
  if (value === undefined || value === null) return { isBlank: true, numberValue: null };
  if (typeof value === "string" && value.trim() === "") return { isBlank: true, numberValue: null };

  const numberValue = Number(value);
  return { isBlank: false, numberValue };
}

function parsePercent(value) {
  if (value === undefined || value === null) return { isBlank: true, numberValue: null };
  if (typeof value === "string" && value.trim() === "") return { isBlank: true, numberValue: null };

  const numberValue = Number(value);
  return { isBlank: false, numberValue };
}

export function normalizePatientDiscountEligibility(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "None";
}

export function getTreatmentDiscountDefaultsFromEligibility(eligibility) {
  const normalizedEligibility = normalizePatientDiscountEligibility(eligibility);

  switch (normalizedEligibility) {
    case "Senior Citizen":
      return { discount_type: "Senior Citizen", discount_percent: "20.00" };
    case "PWD":
      return { discount_type: "PWD", discount_percent: "20.00" };
    case "Senior Citizen and PWD":
      return { discount_type: "Senior Citizen/PWD", discount_percent: "20.00" };
    default:
      return { discount_type: "None", discount_percent: "0.00" };
  }
}

export function calculateTreatmentAmounts({ amount_charged, discount_percent, amount_paid, discount_type }) {
  const charged = Number(amount_charged);
  const resolvedPercent = discount_type === "None" ? 0 : Number(discount_percent);
  const paid = Number(amount_paid);

  if (Number.isNaN(charged) || charged < 0) {
    return { discount_amount: "", net_amount_due: "", balance: "" };
  }

  const safePercent = Number.isNaN(resolvedPercent) || resolvedPercent < 0 ? 0 : Math.min(resolvedPercent, 100);
  const discountAmount = Number((charged * safePercent / 100).toFixed(2));
  const netAmountDue = Number((charged - discountAmount).toFixed(2));

  return {
    discount_amount: discountAmount.toFixed(2),
    net_amount_due: netAmountDue.toFixed(2),
    balance: Number.isNaN(paid) || paid < 0 ? "" : (netAmountDue - paid).toFixed(2)
  };
}

export function validatePatientForm(form) {
  const errors = {};
  const normalized = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, trimValue(value)]));
  normalized.age = Number(calculateAgeFromBirthday(normalized.birthday) || 0);
  normalized.discount_eligibility = normalizePatientDiscountEligibility(normalized.discount_eligibility);
  if (!isPwdRelatedClassification(normalized.discount_eligibility)) {
    normalized.disability_type = "";
  }

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
  const amountCharged = parseAmount(normalized.amount_charged);
  const amountPaid = parseAmount(normalized.amount_paid);
  const discountPercent = parsePercent(normalized.discount_percent);
  const discountAmount = parseAmount(normalized.discount_amount);
  const netAmountDue = parseAmount(normalized.net_amount_due);
  normalized.discount_type = normalized.discount_type || "None";
  const balance = parseAmount(normalized.balance);

  if (!selectedPatient?.patient_id) errors.patient_id = "Select a patient first.";
  if (!/^T-\d{4}-\d{4}$/.test(normalized.treatment_id || "")) errors.treatment_id = "Treatment ID format must be T-YYYY-0001.";
  if (!isValidDateString(normalized.treatment_date)) errors.treatment_date = "Treatment Date is required.";
  if (isFutureDate(normalized.treatment_date)) errors.treatment_date = "Treatment Date cannot be in the future.";
  normalized.next_appointment_date = normalized.next_appointment_date || normalized.next_appointment || "";
  normalized.next_appointment_time = normalized.next_appointment_time || "";
  if (normalized.next_appointment_date && !isValidDateString(normalized.next_appointment_date)) errors.next_appointment_date = "Next Appointment Date is not valid.";
  if (normalized.next_appointment_date && normalized.treatment_date && normalized.next_appointment_date < normalized.treatment_date) errors.next_appointment_date = "Next Appointment Date cannot be earlier than Treatment Date.";
  if (normalized.next_appointment_time && !normalized.next_appointment_date) errors.next_appointment_date = "Next Appointment Date is required when Next Appointment Time is set.";
  if (normalized.next_appointment_time && !isValidTimeString(normalized.next_appointment_time)) errors.next_appointment_time = "Next Appointment Time is not valid.";
  if (!normalized.procedure) errors.procedure = "Procedure is required.";
  if (!normalized.dentists) errors.dentists = "Dentist/s is required.";
  if (amountCharged.isBlank) {
    errors.amount_charged = "Amount Charged is required.";
  } else if (Number.isNaN(amountCharged.numberValue) || amountCharged.numberValue < 0) {
    errors.amount_charged = "Amount Charged must be a valid number that is 0 or greater.";
  }
  if (amountPaid.isBlank) {
    errors.amount_paid = "Amount Paid is required.";
  } else if (Number.isNaN(amountPaid.numberValue) || amountPaid.numberValue < 0) {
    errors.amount_paid = "Amount Paid must be a valid number that is 0 or greater.";
  }
  if (discountPercent.isBlank && normalized.discount_type === "Custom") {
    errors.discount_percent = "Discount Percent is required for a custom discount.";
  } else if (!discountPercent.isBlank && (Number.isNaN(discountPercent.numberValue) || discountPercent.numberValue < 0 || discountPercent.numberValue > 100)) {
    errors.discount_percent = "Discount Percent must be a valid number from 0 to 100.";
  }
  if (balance.isBlank) {
    errors.balance = "Balance is required.";
  } else if (Number.isNaN(balance.numberValue)) {
    errors.balance = "Balance must be a valid number.";
  }

  if (!errors.amount_charged && !errors.amount_paid) {
    normalized.amount_charged = Number(amountCharged.numberValue.toFixed(2));
    normalized.discount_percent = Number(
      (normalized.discount_type === "None"
        ? 0
        : discountPercent.isBlank
          ? treatmentDiscountDefaults[normalized.discount_type] ?? 0
          : discountPercent.numberValue
      ).toFixed(2)
    );
    normalized.discount_amount = Number((normalized.amount_charged * normalized.discount_percent / 100).toFixed(2));
    normalized.net_amount_due = Number((normalized.amount_charged - normalized.discount_amount).toFixed(2));
    normalized.amount_paid = Number(amountPaid.numberValue.toFixed(2));
    normalized.balance = Number((normalized.net_amount_due - normalized.amount_paid).toFixed(2));

    if (normalized.amount_paid > normalized.net_amount_due) {
      errors.amount_paid = "Amount Paid cannot be greater than Net Amount Due.";
    }

    if (!discountAmount.isBlank && Number(normalized.discount_amount.toFixed(2)) !== Number(discountAmount.numberValue.toFixed(2))) {
      errors.discount_amount = "Discount Amount must equal Amount Charged multiplied by Discount Percent.";
    }

    if (!netAmountDue.isBlank && Number(normalized.net_amount_due.toFixed(2)) !== Number(netAmountDue.numberValue.toFixed(2))) {
      errors.net_amount_due = "Net Amount Due must equal Amount Charged minus Discount Amount.";
    }

    if (!errors.balance && Number(normalized.balance.toFixed(2)) !== Number(balance.numberValue.toFixed(2))) {
      errors.balance = "Balance must equal Net Amount Due minus Amount Paid.";
    }
  } else {
    normalized.amount_charged = normalized.amount_charged;
    normalized.amount_paid = normalized.amount_paid;
  }

  normalized.next_appointment = normalized.next_appointment_date;

  return { errors, normalized, isValid: Object.keys(errors).length === 0 };
}

export function validateAppointmentForm(form, selectedPatient) {
  const errors = {};
  const normalized = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, trimValue(value)]));
  normalized.status = normalized.status || "Scheduled";

  if (!selectedPatient?.patient_id) errors.patient_id = "Select a patient first.";
  if (!isValidDateString(normalized.appointment_date)) errors.appointment_date = "Appointment Date is required.";
  if (normalized.appointment_time && !isValidTimeString(normalized.appointment_time)) errors.appointment_time = "Appointment Time is not valid.";
  if (!["Scheduled", "Completed", "Cancelled", "No-show"].includes(normalized.status)) errors.status = "Appointment Status is not valid.";

  return { errors, normalized, isValid: Object.keys(errors).length === 0 };
}
