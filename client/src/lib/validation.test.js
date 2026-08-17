import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAgeFromBirthday,
  calculateTreatmentAmounts,
  getTreatmentDiscountDefaultsFromEligibility,
  normalizePatientDiscountEligibility,
  validateAppointmentForm,
  validatePatientForm,
  validateTreatmentForm
} from "./validation.ts";

const FIXED_NOW = new Date("2026-08-16T12:00:00.000Z");

function withFrozenToday(t, callback) {
  t.mock.timers.enable({ apis: ["Date"], now: FIXED_NOW });
  t.after(() => t.mock.timers.reset());
  callback();
}

function buildValidPatientForm(overrides = {}) {
  return {
    patient_id: "P-2026-0001",
    date_registered: "2026-08-16",
    last_name: "Dela Cruz",
    first_name: "Ana",
    middle_name: "",
    birthday: "2000-08-15",
    gender: "Female",
    mobile_number: "09171234567",
    email_address: "ana@example.com",
    insurance_effective_date: "",
    last_dental_visit: "",
    is_minor: "No",
    parent_guardian_name: "",
    under_medical_treatment: "No",
    medical_treatment_details: "",
    serious_illness_history: "No",
    serious_illness_details: "",
    hospitalized_history: "No",
    hospitalization_details: "",
    taking_medications: "No",
    medication_details: "",
    allergy_local_anesthetic: "No",
    local_anesthetic_details: "",
    allergy_others: "No",
    allergy_others_details: "",
    other_medical_condition: "No",
    other_medical_condition_details: "",
    discount_eligibility: "None",
    disability_type: "Physical Disability",
    age: "",
    ...overrides
  };
}

function buildValidTreatmentForm(overrides = {}) {
  return {
    treatment_id: "T-2026-0001",
    treatment_date: "2026-08-16",
    next_appointment: "",
    next_appointment_date: "",
    next_appointment_time: "",
    procedure: "Cleaning",
    dentists: "Dr. Demo",
    amount_charged: "1000.00",
    discount_type: "None",
    discount_percent: "0",
    discount_amount: "0.00",
    net_amount_due: "1000.00",
    amount_paid: "250.00",
    balance: "750.00",
    ...overrides
  };
}

function buildValidAppointmentForm(overrides = {}) {
  return {
    appointment_date: "2026-08-20",
    appointment_time: "",
    planned_procedure: "",
    notes: "",
    status: "Scheduled",
    ...overrides
  };
}

test("validation helpers preserve age and discount-default behavior", (t) => {
  withFrozenToday(t, () => {
    assert.equal(calculateAgeFromBirthday("2000-08-15"), 26);
    assert.equal(calculateAgeFromBirthday(""), "");
    assert.equal(calculateAgeFromBirthday("not-a-date"), "");

    assert.equal(normalizePatientDiscountEligibility(""), "None");
    assert.equal(normalizePatientDiscountEligibility("  PWD "), "PWD");

    assert.deepEqual(getTreatmentDiscountDefaultsFromEligibility("Senior Citizen"), {
      discount_type: "Senior Citizen",
      discount_percent: "20.00"
    });
    assert.deepEqual(getTreatmentDiscountDefaultsFromEligibility("PWD"), {
      discount_type: "PWD",
      discount_percent: "20.00"
    });
    assert.deepEqual(getTreatmentDiscountDefaultsFromEligibility("Senior Citizen and PWD"), {
      discount_type: "Senior Citizen/PWD",
      discount_percent: "20.00"
    });
    assert.deepEqual(getTreatmentDiscountDefaultsFromEligibility(""), {
      discount_type: "None",
      discount_percent: "0.00"
    });
  });
});

test("calculateTreatmentAmounts preserves current derived-value behavior", () => {
  assert.deepEqual(
    calculateTreatmentAmounts({
      amount_charged: "-1",
      discount_percent: "20",
      amount_paid: "0",
      discount_type: "Senior Citizen"
    }),
    {
      discount_amount: "",
      net_amount_due: "",
      balance: ""
    }
  );

  assert.deepEqual(
    calculateTreatmentAmounts({
      amount_charged: "1000",
      discount_percent: "50",
      amount_paid: "-1",
      discount_type: "None"
    }),
    {
      discount_amount: "0.00",
      net_amount_due: "1000.00",
      balance: ""
    }
  );

  assert.deepEqual(
    calculateTreatmentAmounts({
      amount_charged: "1000",
      discount_percent: "200",
      amount_paid: "10",
      discount_type: "Custom"
    }),
    {
      discount_amount: "1000.00",
      net_amount_due: "0.00",
      balance: "-10.00"
    }
  );
});

test("validatePatientForm preserves trimming, age derivation, PWD clearing, and exact error messages", (t) => {
  withFrozenToday(t, () => {
    const validResult = validatePatientForm(
      buildValidPatientForm({
        first_name: "  Ana  ",
        discount_eligibility: "",
        disability_type: "Visual Disability"
      })
    );

    assert.equal(validResult.isValid, true);
    assert.deepEqual(validResult.errors, {});
    assert.equal(validResult.normalized.first_name, "Ana");
    assert.equal(validResult.normalized.age, 26);
    assert.equal(validResult.normalized.discount_eligibility, "None");
    assert.equal(validResult.normalized.disability_type, "");

    const pwdResult = validatePatientForm(
      buildValidPatientForm({
        discount_eligibility: "PWD",
        disability_type: "Visual Disability"
      })
    );
    assert.equal(pwdResult.normalized.disability_type, "Visual Disability");

    const invalidResult = validatePatientForm(
      buildValidPatientForm({
        patient_id: "bad-id",
        date_registered: "2026-08-17",
        birthday: "2026-08-17",
        mobile_number: "abc",
        email_address: "bad-email",
        is_minor: "Yes",
        parent_guardian_name: "",
        under_medical_treatment: "Yes",
        medical_treatment_details: "",
        serious_illness_history: "Yes",
        serious_illness_details: "",
        hospitalized_history: "Yes",
        hospitalization_details: "",
        taking_medications: "Yes",
        medication_details: "",
        allergy_local_anesthetic: "Yes",
        local_anesthetic_details: "",
        allergy_others: "Yes",
        allergy_others_details: "",
        other_medical_condition: "Yes",
        other_medical_condition_details: ""
      })
    );

    assert.equal(invalidResult.isValid, false);
    assert.equal(invalidResult.errors.patient_id, "Patient ID format must be P-YYYY-0001.");
    assert.equal(invalidResult.errors.date_registered, "Date Registered cannot be in the future.");
    assert.equal(invalidResult.errors.birthday, "Birthday cannot be in the future.");
    assert.equal(invalidResult.errors.mobile_number, "Use digits and phone symbols only.");
    assert.equal(invalidResult.errors.email_address, "Email Address is not valid.");
    assert.equal(invalidResult.errors.parent_guardian_name, "Parent/Guardian Name is required for a minor.");
    assert.equal(invalidResult.errors.medical_treatment_details, "Provide medical treatment details.");
    assert.equal(invalidResult.errors.serious_illness_details, "Provide serious illness or operation details.");
    assert.equal(invalidResult.errors.hospitalization_details, "Provide hospitalization details.");
    assert.equal(invalidResult.errors.medication_details, "Provide medication details.");
    assert.equal(invalidResult.errors.local_anesthetic_details, "Provide local anesthetic details.");
    assert.equal(invalidResult.errors.allergy_others_details, "Provide other allergy details.");
    assert.equal(invalidResult.errors.other_medical_condition_details, "Provide other medical condition details.");
  });
});

test("validateTreatmentForm preserves current discount defaults, date rules, derived values, and error shapes", (t) => {
  withFrozenToday(t, () => {
    const selectedPatient = { patient_id: "P-2026-0001" };

    const seniorResult = validateTreatmentForm(
      buildValidTreatmentForm({
        discount_type: "Senior Citizen",
        discount_percent: "",
        discount_amount: "200.00",
        net_amount_due: "800.00",
        amount_paid: "300.00",
        balance: "500.00"
      }),
      selectedPatient
    );

    assert.equal(seniorResult.isValid, true);
    assert.equal(seniorResult.normalized.discount_percent, 20);
    assert.equal(seniorResult.normalized.discount_amount, 200);
    assert.equal(seniorResult.normalized.net_amount_due, 800);
    assert.equal(seniorResult.normalized.balance, 500);

    const noneResult = validateTreatmentForm(
      buildValidTreatmentForm({
        discount_type: "None",
        discount_percent: "50",
        discount_amount: "0.00",
        net_amount_due: "1000.00",
        amount_paid: "250.00",
        balance: "750.00"
      }),
      selectedPatient
    );
    assert.equal(noneResult.normalized.discount_percent, 0);

    const invalidResult = validateTreatmentForm(
      buildValidTreatmentForm({
        treatment_id: "bad-id",
        treatment_date: "2026-08-17",
        next_appointment_date: "",
        next_appointment_time: "09:30",
        amount_charged: "",
        amount_paid: "900.00",
        balance: "bad"
      }),
      null
    );

    assert.equal(invalidResult.isValid, false);
    assert.equal(invalidResult.errors.patient_id, "Select a patient first.");
    assert.equal(invalidResult.errors.treatment_id, "Treatment ID format must be T-YYYY-0001.");
    assert.equal(invalidResult.errors.treatment_date, "Treatment Date cannot be in the future.");
    assert.equal(invalidResult.errors.next_appointment_date, "Next Appointment Date is required when Next Appointment Time is set.");
    assert.equal(invalidResult.errors.amount_charged, "Amount Charged is required.");
    assert.equal(invalidResult.errors.balance, "Balance must be a valid number.");

    const mismatchResult = validateTreatmentForm(
      buildValidTreatmentForm({
        discount_type: "Senior Citizen",
        discount_percent: "",
        discount_amount: "200.00",
        net_amount_due: "800.00",
        amount_paid: "900.00",
        balance: "400.00"
      }),
      selectedPatient
    );

    assert.equal(mismatchResult.errors.amount_paid, "Amount Paid cannot be greater than Net Amount Due.");

    const customResult = validateTreatmentForm(
      buildValidTreatmentForm({
        discount_type: "Custom",
        discount_percent: ""
      }),
      selectedPatient
    );
    assert.equal(customResult.errors.discount_percent, "Discount Percent is required for a custom discount.");
  });
});

test("validateAppointmentForm preserves current patient, time, status, and default-status behavior", () => {
  const selectedPatient = { patient_id: "P-2026-0001" };

  const validResult = validateAppointmentForm(buildValidAppointmentForm({ status: "" }), selectedPatient);
  assert.equal(validResult.isValid, true);
  assert.equal(validResult.normalized.status, "Scheduled");

  const invalidResult = validateAppointmentForm(
    buildValidAppointmentForm({
      appointment_date: "",
      appointment_time: "99:30",
      status: "Rescheduled"
    }),
    null
  );

  assert.equal(invalidResult.isValid, false);
  assert.equal(invalidResult.errors.patient_id, "Select a patient first.");
  assert.equal(invalidResult.errors.appointment_date, "Appointment Date is required.");
  assert.equal(invalidResult.errors.appointment_time, "Appointment Time is not valid.");
  assert.equal(invalidResult.errors.status, "Appointment Status is not valid.");
});
