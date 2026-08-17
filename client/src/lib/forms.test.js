import assert from "node:assert/strict";
import test from "node:test";
import {
  appointmentStatusOptions,
  emptyAppointment,
  emptyPatient,
  emptyTreatment,
  medicalConditionFields,
  patientFieldGroups,
  suggestedDentists,
  suggestedTreatmentProcedures,
  treatmentDiscountTypes
} from "./forms.ts";

test("forms defaults and metadata preserve current patient, treatment, and appointment contracts", () => {
  assert.equal(emptyPatient.discount_eligibility, "None");
  assert.equal(emptyPatient.is_minor, "No");
  assert.equal(emptyPatient.disability_type, "");
  assert.equal(emptyPatient.condition_high_blood_pressure, 0);
  assert.equal(emptyPatient.condition_arthritis_rheumatism, 0);

  assert.equal(emptyTreatment.discount_type, "None");
  assert.equal(emptyTreatment.discount_percent, "0.00");
  assert.equal(emptyTreatment.discount_amount, "0.00");
  assert.equal(emptyTreatment.net_amount_due, "0.00");
  assert.equal(emptyTreatment.amount_charged, "");
  assert.equal(emptyTreatment.amount_paid, "");
  assert.equal(emptyTreatment.balance, "");

  assert.deepEqual(emptyAppointment, {
    appointment_date: "",
    appointment_time: "",
    planned_procedure: "",
    notes: "",
    status: "Scheduled"
  });

  assert.deepEqual(appointmentStatusOptions, ["Scheduled", "Completed", "Cancelled", "No-show"]);
  assert.deepEqual(treatmentDiscountTypes, ["None", "Senior Citizen", "PWD", "Senior Citizen/PWD", "Custom"]);
  assert.deepEqual(suggestedDentists, ["Dr. Arlen C. Khurana"]);
  assert.ok(suggestedTreatmentProcedures.includes("Dental Consultation"));

  const basicInformationGroup = patientFieldGroups[0];
  const medicalHistoryGroup = patientFieldGroups[1];
  assert.equal(basicInformationGroup.title, "Basic Information");
  assert.equal(medicalHistoryGroup.title, "Medical History");

  const discountEligibilityField = basicInformationGroup.fields.find(([name]) => name === "discount_eligibility");
  assert.deepEqual(discountEligibilityField[5], ["None", "Senior Citizen", "PWD", "Senior Citizen and PWD", "Other"]);

  const disabilityTypeField = medicalHistoryGroup.fields.find(([name]) => name === "disability_type");
  assert.equal(disabilityTypeField[6], "Shown only for PWD-related classification.");

  assert.equal(medicalConditionFields.length, 35);
  assert.deepEqual(medicalConditionFields[0], ["condition_high_blood_pressure", "High Blood Pressure"]);
  assert.deepEqual(medicalConditionFields.at(-1), ["condition_arthritis_rheumatism", "Arthritis / Rheumatism"]);
});
