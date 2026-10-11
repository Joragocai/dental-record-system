import test from "node:test";
import assert from "node:assert/strict";
import {
  getTreatmentFooterCopy,
  getTreatmentHistoryOriginState,
  getTreatmentAttachmentOriginState
} from "./treatmentFormPresentation.js";

test("new treatment footer has the same descriptive guidance as registration", () => {
  assert.deepEqual(getTreatmentFooterCopy("create"), {
    title: "Treatment Registration",
    message: "Complete the required fields before saving."
  });
});

test("editing a treatment has its own title and explanatory text", () => {
  assert.deepEqual(getTreatmentFooterCopy("edit"), {
    title: "Update Treatment Record",
    message: "Review the changes before updating the record."
  });
});

test("saving and validation errors take precedence over idle helper text", () => {
  assert.equal(getTreatmentFooterCopy("edit", true).message, "Saving treatment record...");
  assert.equal(getTreatmentFooterCopy("create", false, "Select a patient first.").message, "Select a patient first.");
  assert.equal(getTreatmentFooterCopy("edit", true, "Unable to save treatment.").message, "Unable to save treatment.");
});

test("new treatment history navigation preserves the unsaved form and selected patient", () => {
  const form = { treatment_id: "T-2026-0055", remarks: "Draft in progress", amount_paid: "200.00" };
  const patient = { patient_id: "P-2026-0021", display_name: "Demo, Patient" };
  const origin = getTreatmentHistoryOriginState("create", form, patient);
  assert.equal(origin.fromTreatmentEntry, true);
  assert.strictEqual(origin.treatmentDraft.form, form);
  assert.strictEqual(origin.treatmentDraft.patient, patient);
  assert.equal(origin.treatmentDraft.form.remarks, "Draft in progress");
  assert.equal(getTreatmentHistoryOriginState("edit", form, patient), undefined);
});

test("attachment links preserve the draft marker and add attachment focus without mutation", () => {
  const origin = getTreatmentHistoryOriginState("create", { remarks: "draft" }, { patient_id: "P-2026-0001" });
  const attachmentState = getTreatmentAttachmentOriginState(origin);
  assert.equal(attachmentState.fromTreatmentEntry, true);
  assert.equal(attachmentState.focusAttachments, true);
  assert.strictEqual(attachmentState.treatmentDraft, origin.treatmentDraft);
  assert.equal(origin.focusAttachments, undefined);
  assert.deepEqual(getTreatmentAttachmentOriginState(undefined), { focusAttachments: true });
});
