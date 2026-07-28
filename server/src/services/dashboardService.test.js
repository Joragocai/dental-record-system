import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  buildTodayScheduleMetrics,
  getDashboardSummaryData,
  getDateRange,
  getManilaIsoDate,
  getScheduleRows
} from "./dashboardService.js";

function createDashboardTestDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE patients (
      patient_id TEXT PRIMARY KEY,
      first_name TEXT,
      middle_name TEXT,
      last_name TEXT,
      mobile_number TEXT,
      branch_location TEXT,
      date_registered TEXT
    );

    CREATE TABLE appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT,
      planned_procedure TEXT,
      status TEXT
    );

    CREATE TABLE treatments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      treatment_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      treatment_date TEXT NOT NULL,
      next_appointment TEXT,
      next_appointment_date TEXT,
      next_appointment_time TEXT,
      procedure TEXT
    );
  `);

  return database;
}

function seedDashboardTestData(database) {
  const insertPatient = database.prepare(`
    INSERT INTO patients (patient_id, first_name, middle_name, last_name, mobile_number, branch_location, date_registered)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAppointment = database.prepare(`
    INSERT INTO appointments (patient_id, appointment_date, appointment_time, planned_procedure, status)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertTreatment = database.prepare(`
    INSERT INTO treatments (treatment_id, patient_id, treatment_date, next_appointment, next_appointment_date, next_appointment_time, procedure)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertPatient.run("P-2026-0001", "Avery", "", "Demo", "09170000001", "Lilac", "2026-07-28");
  insertPatient.run("P-2026-0002", "Bianca", "", "Sample", "09170000002", "Lilac", "2026-07-20");
  insertPatient.run("P-2026-0003", "Caleb", "", "Mock", "09170000003", "Concepcion", "2026-07-12");

  insertAppointment.run("P-2026-0001", "2026-07-28", "09:00", "Dental Consultation", "Scheduled");
  insertAppointment.run("P-2026-0002", "2026-07-28", "10:00", "Cleaning", "Scheduled");
  insertAppointment.run("P-2026-0003", "2026-07-28", "11:00", "Cancelled Visit", "Cancelled");
  insertAppointment.run("P-2026-0003", "2026-07-29", "08:30", "Tomorrow Visit", "Scheduled");
  insertAppointment.run("P-2026-0002", "2026-07-28", "13:00", "Completed Visit", "Completed");

  insertTreatment.run("T-2026-0001", "P-2026-0001", "2026-07-28", "2026-07-28", "2026-07-28", "14:00", "Follow-up Checkup");
  insertTreatment.run("T-2026-0002", "P-2026-0002", "2026-07-28", "", "", "", "Procedure Without Follow-up");
  insertTreatment.run("T-2026-0003", "P-2026-0003", "2026-07-27", "2026-07-28", "2026-07-28", "", "Review");
  insertTreatment.run("T-2026-0004", "P-2026-0003", "2026-07-28", "2026-07-29", "2026-07-29", "15:00", "Future Follow-up");
}

test("total patient count uses all patient rows, not only today's registrations", () => {
  const database = createDashboardTestDatabase();
  seedDashboardTestData(database);

  const summary = getDashboardSummaryData({
    database,
    patients: [
      { patient_id: "P-2026-0001", display_name: "Avery Demo" },
      { patient_id: "P-2026-0002", display_name: "Bianca Sample" },
      { patient_id: "P-2026-0003", display_name: "Caleb Mock" }
    ],
    treatments: [],
    todayIso: "2026-07-28"
  });

  assert.equal(summary.totalPatientRecords, 3);
  database.close();
});

test("today schedule metrics reconcile with final displayed schedule rows by source type", () => {
  const database = createDashboardTestDatabase();
  seedDashboardTestData(database);

  const entries = getScheduleRows(database, "2026-07-28", { includeToday: true });
  const metrics = buildTodayScheduleMetrics(entries, "2026-07-28");

  assert.equal(metrics.appointmentCount, 2);
  assert.equal(metrics.followUpCount, 2);
  assert.equal(entries.filter((entry) => entry.source_type === "appointment").length, 2);
  assert.equal(entries.filter((entry) => entry.source_type === "treatment_follow_up").length, 2);
  assert.equal(entries.length, 4);
  assert.deepEqual(
    entries.map((entry) => entry.source_label),
    [
      "Scheduled Appointment",
      "Scheduled Appointment",
      "Follow-up from Treatment",
      "Follow-up from Treatment"
    ]
  );
  database.close();
});

test("appointment metric follows the same status inclusion rule as the displayed schedule", () => {
  const database = createDashboardTestDatabase();
  seedDashboardTestData(database);

  const entries = getScheduleRows(database, "2026-07-28", { includeToday: true });

  assert.equal(entries.some((entry) => entry.procedure_label === "Cancelled Visit"), false);
  assert.equal(entries.some((entry) => entry.procedure_label === "Completed Visit"), false);
  assert.equal(entries.some((entry) => entry.procedure_label === "Tomorrow Visit"), false);
  database.close();
});

test("follow-up metric counts only treatment follow-up rows that match the dashboard date", () => {
  const database = createDashboardTestDatabase();
  seedDashboardTestData(database);

  const entries = getScheduleRows(database, "2026-07-28", { includeToday: true });

  assert.equal(entries.some((entry) => entry.procedure_label === "Procedure Without Follow-up"), false);
  assert.equal(entries.some((entry) => entry.procedure_label === "Future Follow-up"), false);
  assert.equal(entries.filter((entry) => entry.source_type === "treatment_follow_up").length, 2);
  database.close();
});

test("Manila date handling keeps the local dashboard date and does not shift through UTC parsing", () => {
  assert.equal(getManilaIsoDate(new Date("2026-07-27T16:30:00.000Z")), "2026-07-28");
  assert.equal(getDateRange(new Date("2026-07-27T16:30:00.000Z")).today, "2026-07-28");
});
