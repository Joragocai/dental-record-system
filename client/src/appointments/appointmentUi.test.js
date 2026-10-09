import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  appointmentEndTime,
  formatAppointmentTime,
  manilaToday,
  startOfWeek,
  weekDates
} from "./appointmentUi.js";

test("Manila calendar helpers preserve clinic-local dates without UTC drift", () => {
  assert.equal(manilaToday(new Date("2026-10-09T16:30:00.000Z")), "2026-10-10");
  assert.equal(startOfWeek("2026-10-09"), "2026-10-05");
  assert.deepEqual(weekDates("2026-10-09"), [
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10",
    "2026-10-11"
  ]);
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
});

test("appointment time helpers render clinic-local wall-clock ranges", () => {
  assert.equal(formatAppointmentTime("09:05"), "9:05 AM");
  assert.equal(formatAppointmentTime("13:30"), "1:30 PM");
  assert.equal(appointmentEndTime("09:30", 45), "10:15");
  assert.equal(appointmentEndTime(null, 30), null);
});
