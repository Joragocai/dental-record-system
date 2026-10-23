import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { buildDemoSeedData } from "./demoSeedData.js";
import { validateDemoSeedFixture } from "./demoSeedValidation.js";
import { clearDemoDatabaseRecords } from "./demoDatabaseReset.js";
import { getManilaTodayIso } from "../utils/dateUtils.js";
import { validatePatientPayload, validateTreatmentPayload } from "../utils/validation.js";

test("all expanded demo fixtures pass complete validation", () => {
  const fixture = validateDemoSeedFixture(buildDemoSeedData("2026-10-11"));
  assert.deepEqual(fixture.counts, { patients: 40, treatments: 54, appointments: 38, attachments: 10 });
});

test("Demo Fill fixtures pass at Manila midnight while UTC is still yesterday", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-11T23:42:00Z") });
  try {
    const anchorDate = getManilaTodayIso();
    assert.equal(anchorDate, "2026-10-12");
    const fixture = validateDemoSeedFixture(buildDemoSeedData(anchorDate));
    assert.deepEqual(fixture.counts, { patients: 40, treatments: 54, appointments: 38, attachments: 10 });
    const firstPatient = fixture.patients[0];
    const { errors: patientErrors, data: patientData } = validatePatientPayload({
      ...firstPatient,
      patient_id: "P-2026-0001",
      date_registered: anchorDate
    });
    assert.deepEqual(patientErrors, []);
    assert.equal(patientData.age, 26);
    assert.deepEqual(validatePatientPayload({ ...firstPatient, patient_id: "P-2026-0001", date_registered: "2026-10-13" }).errors, ["Date Registered cannot be in the future."]);
    const firstTreatment = fixture.treatments[0];
    const { errors: treatmentErrors } = validateTreatmentPayload({
      treatment_id: "T-2026-0001", patient_id: "P-2026-0001",
      treatment_date: anchorDate, procedure: firstTreatment.procedure,
      dentists: firstTreatment.dentists, amount_charged: 100,
      amount_paid: 0, balance: 100
    });
    assert.deepEqual(treatmentErrors, []);
  } finally {
    t.mock.timers.reset();
  }
});

test("invalid follow-up time without date is rejected before any database mutation", () => {
  const fixture = buildDemoSeedData("2026-10-11");
  fixture.treatments[31].next_appointment_offset = null;
  fixture.treatments[31].next_appointment_time = "09:30";
  assert.throws(() => validateDemoSeedFixture(fixture), /Treatment 32 failed validation: Next Appointment Date is required/);
});

test("reset removes both seed and manually entered records, with correct empty state", () => {
  const db = new DatabaseSync(":memory:");
  db.exec([
    "CREATE TABLE patients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);",
    "CREATE TABLE treatments (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT);",
    "CREATE TABLE appointments (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT);",
    "CREATE TABLE attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT);",
    "CREATE TABLE treatment_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, amount_cents INTEGER);",
    "INSERT INTO treatment_payments(amount_cents) VALUES (500);",
    "INSERT INTO patients(name) VALUES ('Seed patient'), ('Manual patient');",
    "INSERT INTO treatments(label) VALUES ('Seed treatment'), ('Manual treatment');",
    "INSERT INTO appointments(label) VALUES ('Seed appointment'), ('Manual appointment');",
    "INSERT INTO attachments(label) VALUES ('Seed attachment'), ('Manual attachment');"
  ].join("\n"));
  clearDemoDatabaseRecords(db);
  for (const table of ["patients", "treatments", "appointments", "attachments", "treatment_payments"]) {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM " + table).get().count, 0);
  }
  assert.equal(db.prepare("SELECT name FROM sqlite_sequence WHERE name = 'patients'").get(), undefined);
  db.close();
});
