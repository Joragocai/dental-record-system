import * as React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import PersonnelDashboardView, { type PersonnelDashboardViewProps } from "../pages/PersonnelDashboardView.js";
const base: PersonnelDashboardViewProps = {
  access: null, branches: [], branchId: "", businessDate: "2026-10-10",
  snapshot: null, verifying: false, refreshing: false, notice: "",
  expenseDraft: { categoryCode: "", description: "", amount: "" },
  expenseSaving: false, expenseNotice: "", setBranch() {},
  setBusinessDate() {}, setExpenseDraft() {}, submitExpense() {}
};
test("denied Personnel dashboard excludes clinical and finance actions", () => {
  const output = renderToStaticMarkup(<MemoryRouter><PersonnelDashboardView {...base} /></MemoryRouter>);
  assert.match(output, /workspace is unavailable/);
  assert.doesNotMatch(output, /Submit pending expense|Internal branch finance snapshot/);
});
test("authorized Personnel dashboard shows branch selection without fabricated totals", () => {
  const output = renderToStaticMarkup(<MemoryRouter><PersonnelDashboardView {...base}
    access={{branchIds: ["10000000-0000-4000-8000-000000000001"], patientLookup: false,
      requestReview: false, dailyFinanceRead: false, receivablesRead: false, expenseCreate: false}}
    branches={[{id:"10000000-0000-4000-8000-000000000001",branchName:"Demo Branch",branchCode:"DEMO"}]} /></MemoryRouter>);
  assert.match(output, /Demo Branch/);
  assert.doesNotMatch(output, /₱|Submit pending expense|Confirmed appointments/);
});
