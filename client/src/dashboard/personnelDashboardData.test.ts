import assert from "node:assert/strict";
import test from "node:test";
import {
  assignedSchedulingBranches, clinicBusinessDate, createLatestRequestGuard,
  parsePersonnelAccess, parsePersonnelFinance, pendingRequestCount, summarizeAppointments,
  validateExpenseDraft, visiblePersonnelSnapshot
} from "./personnelDashboardData.js";

const a = "10000000-0000-4000-8000-000000000001";
const b = "20000000-0000-4000-8000-000000000002";
const capabilities = {
  patientLookup: true, requestReview: true, dailyFinanceRead: true,
  receivablesRead: true, expenseCreate: true
};
function context(overrides: Record<string, unknown> = {}) {
  return { roles: ["PERSONNEL"], branchIds: [a], links: [
    { key: "personnel-dashboard", path: "/personnel-dashboard" }
  ], personnel: capabilities, ...overrides };
}
test("only backend-confirmed Personnel access permits branch and finance capabilities", () => {
  assert.deepEqual(parsePersonnelAccess(context()), { branchIds: [a], ...capabilities });
  assert.throws(() => parsePersonnelAccess(context({ roles: ["SYSTEM_ADMINISTRATOR"] })));
  assert.throws(() => parsePersonnelAccess(context({ roles: ["DENTIST"] })));
  assert.throws(() => parsePersonnelAccess(context({ links: [] })));
  assert.throws(() => parsePersonnelAccess(context({ personnel: { ...capabilities, dailyFinanceRead: "true" } })));
  assert.deepEqual(parsePersonnelAccess(context({ branchIds: [] })), {
    branchIds: [], patientLookup: false, requestReview: false, dailyFinanceRead: false,
    receivablesRead: false, expenseCreate: false
  });
});
test("assigned branches never include a forbidden branch", () => {
  const branches = assignedSchedulingBranches({ branches: [
    { id: a, branchName: "Clinic A", branchCode: "A" },
    { id: b, branchName: "Clinic B", branchCode: "B" }
  ] }, parsePersonnelAccess(context()));
  assert.deepEqual(branches.map((row) => row.id), [a]);
  assert.throws(() => assignedSchedulingBranches({ branches: [
    { id: a, branchName: "", branchCode: "A" }
  ] }, parsePersonnelAccess(context())));
});
test("appointment totals fail closed across branch, date, duplicated ids and unknown statuses", () => {
  const record = { id: b, branchId: a, appointmentDate: "2026-10-10", status: "confirmed" };
  assert.deepEqual(summarizeAppointments([record], a, "2026-10-10"), {
    confirmed: 1, checkedIn: 0, unconfirmed: 0
  });
  assert.throws(() => summarizeAppointments([{ ...record, branchId: b }], a, "2026-10-10"));
  assert.throws(() => summarizeAppointments([record, record], a, "2026-10-10"));
  assert.throws(() => summarizeAppointments([{ ...record, status: "invented" }], a, "2026-10-10"));
  assert.throws(() => summarizeAppointments([record], a, "2026-10-11"));
});
test("pending results never misrepresent the 100-record cap as total", () => {
  assert.deepEqual(pendingRequestCount([]), { count: 0, limitReached: false });
  assert.deepEqual(pendingRequestCount(Array.from({ length: 100 }, () => ({
    id: a, request_type: "cancel"
  }))), { count: 100, limitReached: true });
  assert.throws(() => pendingRequestCount([{ request_type: "no_show", id: a }]));
});
test("finance response requires an exact authorized branch/date and incomplete ledger marker", () => {
  const sample = { branchId: a, businessDate: "2026-10-10", internalOnly: true,
    expensesPaidStatus: "not_integrated", cashCollected: "0.00",
    digitalCollected: "21.50", outstandingReceivables: "50.00" };
  assert.deepEqual(parsePersonnelFinance(sample, a, "2026-10-10"), {
    cashCollected: "0.00", digitalCollected: "21.50", outstandingReceivables: "50.00"
  });
  assert.throws(() => parsePersonnelFinance(sample, b, "2026-10-10"));
  assert.throws(() => parsePersonnelFinance({ ...sample, internalOnly: false }, a, "2026-10-10"));
  assert.throws(() => parsePersonnelFinance({ ...sample, cashCollected: "-10.00" }, a, "2026-10-10"));
});
test("branch and date changes never reuse a previously authorized summary", () => {
  const data = {
    appointments: { confirmed: 5, checkedIn: 1, unconfirmed: 2 },
    pending: { count: 3, limitReached: false },
    finance: { cashCollected: "50.00", digitalCollected: "10.00", outstandingReceivables: "40.00" }
  };
  const summary = { branchId: a, date: "2026-10-10", data };
  assert.deepEqual(visiblePersonnelSnapshot(summary, a, "2026-10-10", true), data);
  assert.equal(visiblePersonnelSnapshot(summary, b, "2026-10-10", true), null);
  assert.equal(visiblePersonnelSnapshot(summary, a, "2026-10-11", true), null);
  assert.equal(visiblePersonnelSnapshot(summary, a, "2026-10-10", false), null);
  assert.equal(visiblePersonnelSnapshot(null, a, "2026-10-10", true), null);
});

test("request generations invalidate stale and revoked responses", () => {
  const guard = createLatestRequestGuard();
  const first = guard.begin(); assert.equal(first(), true);
  const second = guard.begin(); assert.equal(first(), false); assert.equal(second(), true);
  guard.cancel(); assert.equal(second(), false);
});
test("expense draft validates approved category, positive exact-decimal money and description", () => {
  const valid = { categoryCode: "DENTAL_SUPPLIES", amount: "123.45", description: "Sample purchase" };
  assert.equal(validateExpenseDraft(valid), true);
  assert.equal(validateExpenseDraft({ ...valid, amount: "0.00" }), false);
  assert.equal(validateExpenseDraft({ ...valid, amount: "0.001" }), false);
  assert.equal(validateExpenseDraft({ ...valid, categoryCode: "FAKE" }), false);
  assert.equal(validateExpenseDraft({ ...valid, description: "x" }), false);
});
test("business date uses Asia/Manila and does not rely on UTC midnight", () => {
  assert.equal(clinicBusinessDate(new Date("2026-10-09T16:20:00.000Z")), "2026-10-10");
});
