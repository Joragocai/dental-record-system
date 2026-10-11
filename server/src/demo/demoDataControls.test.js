import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { buildDemoSeedData } from "./demoSeedData.js";
import { validateDemoSeedFixture } from "./demoSeedValidation.js";
import { clearDemoDatabaseRecords } from "./demoDatabaseReset.js";

test("all expanded demo fixtures pass complete validation", () => {
  const fixture = validateDemoSeedFixture(buildDemoSeedData("2026-10-11"));
  assert.deepEqual(fixture.counts, { patients: 40, treatments: 54, appointments: 38, attachments: 10 });
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
    "INSERT INTO patients(name) VALUES ('Seed patient'), ('Manual patient');",
    "INSERT INTO treatments(label) VALUES ('Seed treatment'), ('Manual treatment');",
    "INSERT INTO appointments(label) VALUES ('Seed appointment'), ('Manual appointment');",
    "INSERT INTO attachments(label) VALUES ('Seed attachment'), ('Manual attachment');"
  ].join("\n"));
  clearDemoDatabaseRecords(db);
  for (const table of ["patients", "treatments", "appointments", "attachments"]) {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM " + table).get().count, 0);
  }
  assert.equal(db.prepare("SELECT name FROM sqlite_sequence WHERE name = 'patients'").get(), undefined);
  db.close();
});
