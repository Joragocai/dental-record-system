import test from "node:test";
import assert from "node:assert/strict";
import { balanceFilters, filterAndSortBalances, getBalancesEmptyState, getPaymentStatus } from "./financialView.js";

const rows = [
  { patient_name: "Alpha", patient_id: "P-2026-0001", treatment_id: "T-2026-0001", procedure: "Cleaning", balance: 0, treatment_date: "2026-10-20", payment_status: "Settled", mobile_number: "09170000001" },
  { patient_name: "Bravo", patient_id: "P-2026-0002", treatment_id: "T-2026-0002", procedure: "Root Canal", balance: 2500, treatment_date: "2026-10-21", payment_status: "Partially Paid", mobile_number: "09170000002" },
  { patient_name: "Charlie", patient_id: "P-2026-0003", treatment_id: "T-2026-0003", procedure: "Extraction", balance: 1000, treatment_date: "2026-10-22", payment_status: "Unpaid", mobile_number: "09170000003" }
];

test("default Unpaid filter shows only treatments with no payments", () => {
  assert.deepEqual(filterAndSortBalances(rows).map((row) => row.treatment_id), ["T-2026-0003"]);
});

test("search matches treatment ID, procedure, name and mobile number within a selected status", () => {
  for (const query of ["t-2026-0002", "root canal", "BRAVO", "09170000002"]) {
    assert.deepEqual(filterAndSortBalances(rows, { query, filter: "Partially Paid" }).map((row) => row.treatment_id), ["T-2026-0002"]);
  }
  assert.deepEqual(filterAndSortBalances(rows, { query: "Alpha", filter: "Settled" }).map((row) => row.patient_name), ["Alpha"]);
});

test("filters contain only distinct payment statuses", () => {
  assert.deepEqual(balanceFilters, ["Unpaid", "Partially Paid", "Settled"]);
  assert.deepEqual(filterAndSortBalances(rows, { filter: "Unpaid" }).map((row) => row.patient_name), ["Charlie"]);
  assert.deepEqual(filterAndSortBalances(rows, { filter: "Partially Paid" }).map((row) => row.patient_name), ["Bravo"]);
  assert.deepEqual(filterAndSortBalances(rows, { filter: "Settled" }).map((row) => row.patient_name), ["Alpha"]);
});

test("alternate sorts work within the selected payment status", () => {
  const partialPayments = [...rows, {
    ...rows[1], patient_name: "Zoe", treatment_id: "T-2026-0004", treatment_date: "2026-10-22", balance: 1000
  }];
  assert.deepEqual(filterAndSortBalances(partialPayments, { filter: "Partially Paid", sort: "recent" }).map((row) => row.patient_name), ["Zoe", "Bravo"]);
  assert.deepEqual(filterAndSortBalances(partialPayments, { filter: "Partially Paid", sort: "patient" }).map((row) => row.patient_name), ["Bravo", "Zoe"]);
  assert.deepEqual(filterAndSortBalances(partialPayments, { filter: "Partially Paid", sort: "balance" }).map((row) => row.patient_name), ["Bravo", "Zoe"]);
});

test("patient-specific balances show only that patient, including settled treatments", () => {
  const ownRows = [rows[0], { ...rows[1], patient_id: rows[0].patient_id }, rows[2]];
  assert.deepEqual(filterAndSortBalances(ownRows, { patientId: rows[0].patient_id }).map((row) => row.treatment_id), ["T-2026-0002", "T-2026-0001"]);
  assert.deepEqual(filterAndSortBalances(ownRows, { patientId: rows[0].patient_id, query: "clean" }).map((row) => row.treatment_id), ["T-2026-0001"]);
});

test("empty statuses have useful messages without a redundant clear button", () => {
  for (const [status, title] of [
    ["Unpaid", "No Unpaid Treatments"],
    ["Partially Paid", "No Partially Paid Treatments"],
    ["Settled", "No Settled Treatments"]
  ]) {
    const empty = getBalancesEmptyState({ filter: status });
    assert.equal(empty.title, title);
    assert.equal(empty.showClearSearch, false);
    assert.match(empty.description, /Select another payment status/);
  }
});

test("search misses offer Clear Search without changing the payment status", () => {
  const empty = getBalancesEmptyState({ filter: "Settled", query: " no match " });
  assert.equal(empty.title, "No Matching Treatments");
  assert.equal(empty.showClearSearch, true);
  assert.match(empty.description, /within this payment status/);
});

test("patient-specific empty states remain distinct", () => {
  const noAccounts = getBalancesEmptyState({ patientMode: true });
  assert.equal(noAccounts.title, "No Treatment Accounts");
  assert.equal(noAccounts.showClearSearch, false);
  const noMatch = getBalancesEmptyState({ patientMode: true, query: "implant" });
  assert.equal(noMatch.title, "No Matching Treatments");
  assert.equal(noMatch.showClearSearch, true);
  assert.match(noMatch.description, /this patient/);
});

test("status labels compare in centavos", () => {
  assert.equal(getPaymentStatus(100, 100), "Settled");
  assert.equal(getPaymentStatus(100, 10), "Partially Paid");
  assert.equal(getPaymentStatus(100, 0), "Unpaid");
});
