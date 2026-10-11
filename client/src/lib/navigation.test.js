import test from "node:test";
import assert from "node:assert/strict";
import { isPatientsNavigationActive } from "./navigation.js";

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
