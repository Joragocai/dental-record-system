import test from "node:test";
import assert from "node:assert/strict";
import { balanceViewFromSearchParams, balancesBackDestination, balancesDetailState, balanceSourceLabel, patientBalancesPath, safeInternalLocation } from "./balanceNavigation.js";

test("patient balances navigation contains the exact patient ID", () => {
  assert.equal(patientBalancesPath("P-2026-0012"), "/balances?patientId=P-2026-0012");
});

test("balances back navigation preserves an internal source and falls back safely", () => {
  assert.deepEqual(balancesBackDestination({pathname:"/patients/P-2026-0012",hash:"#patient-financial-summary"}, "P-2026-0012"), {pathname:"/patients/P-2026-0012",search:"",hash:"#patient-financial-summary"});
  assert.deepEqual(balancesBackDestination(null, "P-2026-0012"), { pathname:"/patients/P-2026-0012" });
  assert.deepEqual(balancesBackDestination(null), { pathname:"/" });
  assert.deepEqual(safeInternalLocation({pathname:"//evil.test"}, "/"), {pathname:"/"});
  assert.deepEqual(safeInternalLocation({pathname:"https://evil.test"}, "/"), {pathname:"/"});
  assert.equal(balanceSourceLabel("/patients/P-2026-0012"), "Patient Record");
  assert.equal(balanceSourceLabel("/"), "Home");
});

test("payment detail navigation retains the complete filtered Balances destination", () => {
  const entry = {
    pathname: "/balances",
    search: "?patientId=P-2026-0012&q=root&sort=patient",
    hash: "",
    state: { backTo: {pathname:"/patients/P-2026-0012",hash:"#patient-financial-summary"} }
  };
  const state = balancesDetailState(entry);
  assert.deepEqual(state.balancesReturnTo, {pathname:entry.pathname,search:entry.search,hash:entry.hash});
  assert.deepEqual(state.balancesOrigin, entry.state.backTo);
});

test("query view state preserves valid preferences and ignores unexpected statuses", () => {
  const state = balanceViewFromSearchParams(new URLSearchParams("?patientId=P-2026-0012&q=braces&sort=recent&status=Settled"));
  assert.deepEqual(state, {patientId:"P-2026-0012",query:"braces",sort:"recent",status:"Settled"});
  assert.equal(balanceViewFromSearchParams(new URLSearchParams("?status=All+Treatments&sort=invalid")).status, "Unpaid");
  assert.equal(balanceViewFromSearchParams(new URLSearchParams("?status=All+Treatments&sort=invalid")).sort, "balance");
});
