import test from "node:test";
import assert from "node:assert/strict";
import { patientFieldGroups, emptyPatient } from "./forms.js";
import { isPwdRelatedClassification } from "./formatters.js";

test("Type of Disability remains defined under Medical History", () => {
  assert.equal(
    patientFieldGroups[0].fields.some(([name]) => name === "disability_type"),
    false
  );
  const disabilityFields = patientFieldGroups[1].fields.filter(([name]) => name === "disability_type");
  assert.equal(disabilityFields.length, 1);
  assert.equal(disabilityFields[0][1], "Type of Disability");
});

test("only PWD-related classifications reveal the disability field", () => {
  for (const [classification, visible] of [
    ["None", false],
    ["Senior Citizen", false],
    ["Other", false],
    ["PWD", true],
    ["Senior Citizen and PWD", true]
  ]) {
    assert.equal(isPwdRelatedClassification(classification), visible, classification);
  }
});
