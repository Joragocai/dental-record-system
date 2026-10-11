import test from "node:test";
import assert from "node:assert/strict";
import { emptyAppointment } from "./forms.js";
import { hasUnsavedAppointmentChanges } from "./appointmentFormState.js";

const initial = { ...emptyAppointment, appointment_date: "2026-10-11" };

test("an unchanged new appointment does not prompt about default date and status", () => {
  assert.equal(hasUnsavedAppointmentChanges({ ...initial }, initial), false);
  assert.equal(hasUnsavedAppointmentChanges(initial, null), false);
});

test("appointment date, time, procedure, status and notes changes require warning", () => {
  for (const changed of [
    { appointment_date: "2026-10-12" },
    { appointment_time: "10:30" },
    { planned_procedure: "Oral Prophylaxis" },
    { status: "Cancelled" },
    { notes: "Patient requested a morning visit" }
  ]) {
    assert.equal(hasUnsavedAppointmentChanges({ ...initial, ...changed }, initial), true);
  }
});

test("editing an appointment compares against its loaded values, not new-form defaults", () => {
  const loaded = { ...initial, appointment_date: "2026-10-20", notes: "Initial note", status: "Scheduled" };
  assert.equal(hasUnsavedAppointmentChanges({ ...loaded }, loaded), false);
  assert.equal(hasUnsavedAppointmentChanges({ ...loaded, notes: "Updated note" }, loaded), true);
  assert.equal(hasUnsavedAppointmentChanges({ ...loaded, notes: "Initial note" }, loaded), false);
});

test("read-only server fields do not create false unsaved-change warnings", () => {
  assert.equal(hasUnsavedAppointmentChanges({ ...initial, id: "appointment-1", patient_id: "P-2026-0001" }, initial), false);
});
