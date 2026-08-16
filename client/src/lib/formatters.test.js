import assert from "node:assert/strict";
import test from "node:test";
import {
  displayNoFinalTime,
  displayNone,
  displayPlannedProcedure,
  formatPesoAmount,
  formatReadableDate,
  formatTimeValue,
  isPwdRelatedClassification,
  shouldShowPatientClassificationInSummary
} from "./formatters.ts";

test("formatters preserve current money, date, time, fallback, and classification behavior", () => {
  assert.equal(formatPesoAmount(1234.5), "₱1,234.50");
  assert.equal(formatPesoAmount(""), "₱0.00");
  assert.equal(formatPesoAmount("not-a-number"), "₱0.00");

  assert.equal(displayNone(""), "None");
  assert.equal(displayNone("  "), "None");
  assert.equal(displayNone("Branch A"), "Branch A");
  assert.equal(displayNone(123), 123);

  assert.equal(formatReadableDate("2026-08-09"), "Aug 9, 2026");
  assert.equal(formatReadableDate(""), "");
  assert.equal(formatReadableDate("not-a-date"), "not-a-date");

  assert.equal(formatTimeValue("00:00"), "12:00 AM");
  assert.equal(formatTimeValue("13:05"), "1:05 PM");
  assert.equal(formatTimeValue("9:30"), "9:30");

  assert.equal(displayNoFinalTime(""), "No final time");
  assert.equal(displayNoFinalTime("09:30"), "9:30 AM");

  assert.equal(displayPlannedProcedure(""), "General Appointment");
  assert.equal(displayPlannedProcedure("Cleaning"), "Cleaning");
  assert.equal(displayPlannedProcedure(123), 123);

  assert.equal(isPwdRelatedClassification("PWD"), true);
  assert.equal(isPwdRelatedClassification("Senior Citizen and PWD"), true);
  assert.equal(isPwdRelatedClassification("Senior Citizen"), false);
  assert.equal(isPwdRelatedClassification(""), false);

  assert.equal(shouldShowPatientClassificationInSummary("Senior Citizen"), true);
  assert.equal(shouldShowPatientClassificationInSummary("PWD"), true);
  assert.equal(shouldShowPatientClassificationInSummary("Senior Citizen and PWD"), true);
  assert.equal(shouldShowPatientClassificationInSummary("None"), false);
  assert.equal(shouldShowPatientClassificationInSummary("Other"), false);
  assert.equal(shouldShowPatientClassificationInSummary(""), false);
});
