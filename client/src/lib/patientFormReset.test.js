import test from "node:test";
import assert from "node:assert/strict";
import { emptyPatient } from "./forms.js";
import { clearPatientFormFields, hasPatientFieldsToClear, hasUnsavedPatientEdits, prepareNewPatientRegistration } from "./patientFormReset.js";

test("metadata and generated values alone do not prompt to clear", () => {
  assert.equal(hasPatientFieldsToClear({ ...emptyPatient, patient_id: "P-2026-0042", date_registered: "2026-10-11", age: 22, medical_alert_summary: "Derived" }), false);
});

test("entered text, modified selects and checked medical conditions trigger confirmation", () => {
  for (const patch of [{ first_name: "Demo" }, { gender: "Female" }, { condition_asthma: 1 }]) {
    assert.equal(hasPatientFieldsToClear({ ...emptyPatient, ...patch }), true);
  }
});

test("edit-mode dirty detection ignores generated and equivalent SQLite values", () => {
  const baseline = { ...emptyPatient, first_name: "Sam", condition_asthma: 0 };
  assert.equal(hasUnsavedPatientEdits(baseline, null), false);
  assert.equal(hasUnsavedPatientEdits({ ...baseline, condition_asthma: "0", patient_id: "P-2026-0020", medical_alert_summary: "Auto" }, baseline), false);
  assert.equal(hasUnsavedPatientEdits({ ...baseline, first_name: "Samuel" }, baseline), true);
  assert.equal(hasUnsavedPatientEdits({ ...baseline, condition_asthma: 1 }, baseline), true);
  assert.equal(hasUnsavedPatientEdits({ ...baseline, condition_asthma: 0 }, { ...baseline, condition_asthma: 1 }), true);
  assert.equal(hasUnsavedPatientEdits({ ...baseline, gender: "Female" }, baseline), true);
});

test("register another requires a fresh valid ID before resetting entries", () => {
  const prepared = prepareNewPatientRegistration({patient_id:"P-2026-0043",date_registered:"2026-10-11"},"P-2026-0042");
  assert.deepEqual(prepared,{...emptyPatient,patient_id:"P-2026-0043",date_registered:"2026-10-11"});
  assert.throws(()=>prepareNewPatientRegistration({patient_id:"P-2026-0042",date_registered:"2026-10-11"},"P-2026-0042"),/fresh Patient ID/);
  assert.throws(()=>prepareNewPatientRegistration({patient_id:"",date_registered:"2026-10-11"},"P-2026-0042"),/fresh Patient ID/);
});

test("clearing restores defaults without changing generated ID and registration date", () => {
  const input = { ...emptyPatient, patient_id: "P-2026-0042", date_registered: "2026-10-11", first_name: "Demo", gender: "Male", condition_asthma: 1, age: 22, medical_alert_summary: "Asthma" };
  const result = clearPatientFormFields(input);
  assert.deepEqual(result, { ...emptyPatient, patient_id: "P-2026-0042", date_registered: "2026-10-11" });
  assert.equal(input.first_name, "Demo");
});
