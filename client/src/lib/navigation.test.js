import test from "node:test";
import assert from "node:assert/strict";
import { isPatientsNavigationActive, primaryNavigationItems } from "./navigation.js";

test("main navigation has five clinic-facing links and excludes technical Maintenance", () => {
  assert.deepEqual(primaryNavigationItems.map(({ to, label }) => ({ to, label })), [
    { to: "/", label: "Home" },
    { to: "/patients", label: "Patient Search" },
    { to: "/patients/new", label: "Register Patient" },
    { to: "/treatments/new", label: "Record Treatment" },
    { to: "/balances", label: "Balances" }
  ]);
  assert.equal(primaryNavigationItems.some(({ to }) => to === "/settings"), false);
  for (const item of primaryNavigationItems) {
    assert.equal(item.isActive(item.to), true, item.label);
  }
});

test("Patients stays highlighted across patient record workflows", () => {
  for (const path of [
    "/patients",
    "/patients/",
    "/patients/search",
    "/patients/P-2026-0040",
    "/patients/P-2026-0040/edit",
    "/patients/P-2026-0040/treatments",
    "/patients/P-2026-0040/appointments/new",
    "/patients/P-2026-0040/appointments/a1/edit",
    "/treatments/T-2026-0054",
    "/treatments/T-2026-0054/edit",
    "/print/patients/P-2026-0040",
    "/print/patients/P-2026-0040/treatments",
    "/print/treatments/T-2026-0054"
  ]) {
    assert.equal(isPatientsNavigationActive(path), true, path);
  }
});

test("Register Patient and other unrelated sections do not highlight Patients", () => {
  for (const path of [
    "/",
    "/patients/new",
    "/patients/new/",
    "/patients-export",
    "/treatments/new",
    "/treatments/new/",
    "/treatments/T-2026-0054/print",
    "/print/treatments/new/extra",
    "/settings"
  ]) {
    assert.equal(isPatientsNavigationActive(path), false, path);
  }
});
