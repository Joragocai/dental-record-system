import test from "node:test";
import assert from "node:assert/strict";
import { isPatientUpdatedNotice, patientUpdatedNotice } from "./patientSaveNotice.js";

test("a successful edit produces a patient update success notification", () => {
  assert.deepEqual(patientUpdatedNotice(), {
    title: "Patient Updated Successfully!",
    message: "Changes to the patient's information have been saved."
  });
});

test("only the edit-success marker activates the notification", () => {
  assert.equal(isPatientUpdatedNotice({ kind: "patient-updated" }), true);
  for (const value of [
    undefined,
    null,
    { kind: "patient-created" },
    { kind: "appointment-updated" },
    { kind: "treatment-updated" },
    { kind: "patient-update-failed" }
  ]) {
    assert.equal(isPatientUpdatedNotice(value), false);
  }
});
