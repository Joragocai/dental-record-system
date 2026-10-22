import test from "node:test";
import assert from "node:assert/strict";
import { getManilaTodayIso } from "./clinicDate.js";
import { calculateAgeFromBirthday, validatePatientForm, validateTreatmentForm } from "./validation.js";

test("client date advances at Manila midnight while UTC is a day behind", () => {
  assert.equal(getManilaTodayIso(new Date("2026-10-11T15:59:59Z")), "2026-10-11");
  assert.equal(getManilaTodayIso(new Date("2026-10-11T16:00:00Z")), "2026-10-12");
  assert.equal(getManilaTodayIso(new Date("2026-12-31T16:00:00Z")), "2027-01-01");
});

test("patient and treatment client validation accept Manila today and reject tomorrow", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-11T23:42:00Z") });
  try {
    const patient = {
      patient_id: "P-2026-0001",
      date_registered: "2026-10-12",
      first_name: "Fictional",
      last_name: "Demo",
      birthday: "1996-10-12",
      gender: "Female",
      mobile_number: "09170000001"
    };
    const accepted = validatePatientForm(patient);
    assert.equal(accepted.isValid, true, JSON.stringify(accepted.errors));
    assert.equal(calculateAgeFromBirthday(patient.birthday), 30);
    assert.equal(validatePatientForm({ ...patient, date_registered: "2026-10-13" }).errors.date_registered, "Date Registered cannot be in the future.");
    assert.equal(validatePatientForm({ ...patient, birthday: "2026-10-13" }).errors.birthday, "Birthday cannot be in the future.");

    const treatment = {
      treatment_id: "T-2026-0001",
      treatment_date: "2026-10-12",
      procedure: "Demo cleaning",
      dentists: "Dr. Demo",
      amount_charged: "100.00",
      discount_type: "None",
      amount_paid: "0.00",
      balance: "100.00"
    };
    const selectedPatient = { patient_id: patient.patient_id };
    const result = validateTreatmentForm(treatment, selectedPatient);
    assert.equal(result.isValid, true, JSON.stringify(result.errors));
    assert.equal(validateTreatmentForm({ ...treatment, treatment_date: "2026-10-13" }, selectedPatient).errors.treatment_date, "Treatment Date cannot be in the future.");
  } finally {
    t.mock.timers.reset();
  }
});

test("age uses Philippine calendar when UTC is still on the previous day", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-11T15:59:59Z") });
  try {
    assert.equal(calculateAgeFromBirthday("1996-10-12"), 29);
  } finally {
    t.mock.timers.reset();
  }
});
