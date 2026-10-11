import test from "node:test";
import assert from "node:assert/strict";
import { appointmentSaveNotice, isAppointmentSaveNotice } from "./appointmentSaveNotice.js";

test("create and edit display distinct messages after a successful save", () => {
  assert.match(appointmentSaveNotice("create").title, /Saved Successfully/);
  assert.match(appointmentSaveNotice("edit").title, /Updated Successfully/);
  assert.equal(appointmentSaveNotice("unknown"), null);
});

test("only recognized appointment navigation notices are accepted", () => {
  assert.equal(isAppointmentSaveNotice({kind:"appointment-created"}),true);
  assert.equal(isAppointmentSaveNotice({kind:"appointment-updated"}),true);
  assert.equal(isAppointmentSaveNotice({kind:"patient-edited"}),false);
  assert.equal(isAppointmentSaveNotice(undefined),false);
});
