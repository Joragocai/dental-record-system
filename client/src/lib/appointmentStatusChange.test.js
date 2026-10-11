import test from "node:test";
import assert from "node:assert/strict";
import { proposeAppointmentStatusChange } from "./appointmentStatusChange.js";

const appointment = {
  id: 14,
  status: "Scheduled",
  appointment_date: "2026-10-12",
  planned_procedure: "Dental Consultation"
};

test("changing the status creates a confirmation proposal without modifying the saved record", () => {
  const proposal = proposeAppointmentStatusChange(appointment, "Completed");
  assert.deepEqual(proposal, {
    appointmentId: 14,
    currentStatus: "Scheduled",
    nextStatus: "Completed",
    appointmentDate: "2026-10-12",
    plannedProcedure: "Dental Consultation"
  });
  assert.equal(appointment.status, "Scheduled");
});

test("all supported destination statuses may be confirmed", () => {
  for (const nextStatus of ["Completed", "Cancelled", "No-show"]) {
    assert.equal(proposeAppointmentStatusChange(appointment, nextStatus)?.nextStatus, nextStatus);
  }
});

test("same-status selection and invalid values do not request a change", () => {
  assert.equal(proposeAppointmentStatusChange(appointment, "Scheduled"), null);
  assert.equal(proposeAppointmentStatusChange(appointment, "Invalid"), null);
  assert.equal(proposeAppointmentStatusChange(null, "Completed"), null);
});

test("older records without a saved status use Scheduled as the initial status", () => {
  assert.equal(proposeAppointmentStatusChange({ ...appointment, status: "" }, "Cancelled")?.currentStatus, "Scheduled");
});
