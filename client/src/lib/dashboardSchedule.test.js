import test from "node:test";
import assert from "node:assert/strict";
import { DASHBOARD_SCHEDULE_ORIGIN, filterScheduleRows, isDashboardScheduleOrigin, isDirectScheduleRowClick, scheduleEntryDestination } from "./dashboardSchedule.js";

test("scheduled appointment links directly to its edit screen", () => {
  assert.equal(scheduleEntryDestination({patient_id:"P-2026-0002",source_type:"appointment",source_id:42}), "/patients/P-2026-0002/appointments/42/edit");
});
test("follow-up links to treatment by public treatment ID", () => {
  assert.equal(scheduleEntryDestination({patient_id:"P-2026-0002",source_type:"treatment_follow_up",source_id:7,treatment_record_id:"T-2026-0007"}),"/treatments/T-2026-0007");
});
test("missing source identifiers use the patient record instead of an invalid URL", () => {
  assert.equal(scheduleEntryDestination({patient_id:"P-2026-0002",source_type:"treatment_follow_up"}),"/patients/P-2026-0002");
});
test("only a recognized dashboard marker changes the Back destination", () => {
  assert.equal(isDashboardScheduleOrigin(DASHBOARD_SCHEDULE_ORIGIN), true);
  assert.equal(isDashboardScheduleOrigin({ fromDashboardSchedule: false }), false);
  assert.equal(isDashboardScheduleOrigin({ returnTo: "https://example.test" }), false);
  assert.equal(isDashboardScheduleOrigin(null), false);
});

test("plain row clicks navigate but nested links, inputs, and modified clicks keep their native behavior", () => {
  const event = { button: 0, defaultPrevented: false, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: { closest: () => null } };
  assert.equal(isDirectScheduleRowClick(event), true);
  assert.equal(isDirectScheduleRowClick({ ...event, target: { closest: () => ({ tagName: "A" }) } }), false);
  assert.equal(isDirectScheduleRowClick({ ...event, ctrlKey: true }), false);
  assert.equal(isDirectScheduleRowClick({ ...event, metaKey: true }), false);
  assert.equal(isDirectScheduleRowClick({ ...event, button: 1 }), false);
  assert.equal(isDirectScheduleRowClick({ ...event, defaultPrevented: true }), false);
});

test("status filtering preserves follow-ups under Scheduled only", () => {
  const rows=[{source_type:"appointment",status:"Scheduled"},{source_type:"appointment",status:"Completed"},{source_type:"appointment",status:"Cancelled"},{source_type:"treatment_follow_up",status:""}];
  assert.equal(filterScheduleRows(rows,"All").length,4);
  assert.equal(filterScheduleRows(rows,"Scheduled").length,2);
  assert.equal(filterScheduleRows(rows,"Completed").length,1);
  assert.equal(filterScheduleRows(rows,"Cancelled").length,1);
});
