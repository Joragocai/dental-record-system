import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { getNextPatientId, getNextTreatmentId } from "./idService.js";

function createIdTestDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE patients (
      patient_id TEXT NOT NULL UNIQUE
    );

    CREATE TABLE treatments (
      treatment_id TEXT NOT NULL UNIQUE
    );
  `);
  return database;
}

test("getNextPatientId keeps P-YYYY-0001 format and increments within the same year", () => {
  const database = createIdTestDatabase();

  database.prepare("INSERT INTO patients (patient_id) VALUES (?)").run("P-2026-0001");
  database.prepare("INSERT INTO patients (patient_id) VALUES (?)").run("P-2026-0002");

  assert.equal(getNextPatientId(new Date("2026-08-09T12:00:00.000Z"), database), "P-2026-0003");

  database.close();
});

test("getNextPatientId resets to 0001 for a new year when no patient exists in that year", () => {
  const database = createIdTestDatabase();

  database.prepare("INSERT INTO patients (patient_id) VALUES (?)").run("P-2025-0009");

  assert.equal(getNextPatientId(new Date("2026-01-01T12:00:00.000Z"), database), "P-2026-0001");

  database.close();
});

test("getNextTreatmentId keeps T-YYYY-0001 format and increments within the same year", () => {
  const database = createIdTestDatabase();

  database.prepare("INSERT INTO treatments (treatment_id) VALUES (?)").run("T-2026-0001");
  database.prepare("INSERT INTO treatments (treatment_id) VALUES (?)").run("T-2026-0002");

  assert.equal(getNextTreatmentId(new Date("2026-08-09T12:00:00.000Z"), database), "T-2026-0003");

  database.close();
});

test("getNextTreatmentId resets to 0001 for a new year when no treatment exists in that year", () => {
  const database = createIdTestDatabase();

  database.prepare("INSERT INTO treatments (treatment_id) VALUES (?)").run("T-2025-0015");

  assert.equal(getNextTreatmentId(new Date("2026-01-01T12:00:00.000Z"), database), "T-2026-0001");

  database.close();
});
