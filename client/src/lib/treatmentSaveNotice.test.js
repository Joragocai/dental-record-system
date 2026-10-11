import test from "node:test";
import assert from "node:assert/strict";
import { consumeTreatmentSaveNotice, treatmentSaveNotice } from "./treatmentSaveNotice.js";

test("creating a treatment produces the expected success message", () => {
  assert.deepEqual(treatmentSaveNotice("create"), {
    title: "Treatment Saved Successfully!",
    message: "The treatment has been added to the patient's record."
  });
});

test("updating a treatment produces a distinct message", () => {
  assert.deepEqual(treatmentSaveNotice("edit"), {
    title: "Treatment Updated Successfully!",
    message: "The treatment changes have been saved to the patient's record."
  });
});

test("consuming the notice removes it but preserves contextual navigation state", () => {
  const input = { saveNotice: { kind: "treatment-created" }, fromTreatmentEntry: true };
  const consumed = consumeTreatmentSaveNotice(input);
  assert.equal(consumed.notice.title, "Treatment Saved Successfully!");
  assert.deepEqual(consumed.remainingState, { fromTreatmentEntry: true });
  assert.deepEqual(input.saveNotice, { kind: "treatment-created" });
  assert.equal(consumeTreatmentSaveNotice(consumed.remainingState), null);
});

test("edit confirmation can be consumed once without leaving notice state behind", () => {
  const consumed = consumeTreatmentSaveNotice({ saveNotice: { kind: "treatment-updated" } });
  assert.equal(consumed.notice.title, "Treatment Updated Successfully!");
  assert.equal(consumed.remainingState, null);
  assert.equal(consumeTreatmentSaveNotice(consumed.remainingState), null);
});

test("failed, invalid, and unrelated navigation never trigger a success notice", () => {
  for (const state of [
    undefined,
    {},
    { saveNotice: { kind: "appointment-updated" } },
    { saveNotice: { kind: "treatment-failed" } },
    { saveNotice: null }
  ]) {
    assert.equal(consumeTreatmentSaveNotice(state), null);
  }
  assert.equal(treatmentSaveNotice("cancel"), null);
});
