import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { ensurePaymentLedger } from "../db/paymentSchema.js";
import { getPaidCents, listPaymentRows, recordPayment, reversePayment } from "./paymentLedger.js";
import { getBalancesReport, getPatientFinancialSummary } from "./balancesService.js";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE patients (patient_id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, middle_name TEXT, mobile_number TEXT, branch_location TEXT);
    CREATE TABLE treatments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, treatment_id TEXT NOT NULL UNIQUE,
      patient_id TEXT, treatment_date TEXT, procedure TEXT,
      amount_charged REAL, discount_amount REAL, net_amount_due REAL,
      amount_paid REAL, balance REAL, created_at TEXT, updated_at TEXT
    );
    INSERT INTO patients VALUES ('P-2026-0001','Demo','Patient','', '', 'Lilac');
    INSERT INTO treatments (treatment_id, patient_id, treatment_date, procedure, amount_charged, discount_amount,
      net_amount_due, amount_paid, balance, created_at, updated_at)
    VALUES ('T-2026-0001','P-2026-0001','2026-10-10','Root Canal',8000,0,8000,2000,6000,'2026-10-10T09:00:00Z','2026-10-10T09:00:00Z'),
           ('T-2026-0002','P-2026-0001','2026-10-10','Extraction',2000,0,2000,0,2000,'2026-10-10T09:00:00Z','2026-10-10T09:00:00Z');
  `);
  ensurePaymentLedger(db);
  return db;
}
const clock = new Date("2026-10-23T03:00:00Z");
function entry(overrides = {}) {
  return { amount: "1500.00", payment_date: "2026-10-23", payment_method: "GCash",
    reference: "GCASH-FAKE", notes: "Demo only", request_id: "12345678-1234-1234-1234-123456789abc", ...overrides };
}

test("existing aggregates migrate exactly once as opening entries without invented payment date", () => {
  const db = setup();
  try {
    assert.equal(getPaidCents(db, "T-2026-0001"), 200000);
    assert.equal(listPaymentRows(db, "T-2026-0001", 8000)[0].payment_date, null);
    assert.equal(listPaymentRows(db, "T-2026-0001", 8000)[0].source, "opening");
    ensurePaymentLedger(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM treatment_payments").get().n, 1);
  } finally { db.close(); }
});

test("partial payments update one treatment and idempotent retries do not duplicate", () => {
  const db = setup();
  try {
    const first = recordPayment(db, "T-2026-0001", entry(), clock);
    assert.equal(first.repeated, false);
    const duplicate = recordPayment(db, "T-2026-0001", entry(), clock);
    assert.equal(duplicate.repeated, true);
    assert.equal(getPaidCents(db, "T-2026-0001"), 350000);
    assert.equal(getPaidCents(db, "T-2026-0002"), 0);
    assert.equal(db.prepare("SELECT balance FROM treatments WHERE treatment_id = 'T-2026-0001'").get().balance, 4500);
    assert.equal(getPatientFinancialSummary(db, "P-2026-0001").outstanding, 6500);
    assert.equal(getBalancesReport(db).summary.patients_with_balance, 1);
    assert.throws(() => recordPayment(db, "T-2026-0001", entry({amount:"1501.00"}), clock), /identifier was already used/);
  } finally { db.close(); }
});

test("overpayment, future dates and invalid monetary precision are rejected without creating rows", () => {
  const db = setup();
  try {
    const count = db.prepare("SELECT COUNT(*) AS n FROM treatment_payments").get().n;
    assert.throws(() => recordPayment(db, "T-2026-0001", entry({amount:"7000.00"}), clock), /cannot exceed/i);
    assert.throws(() => recordPayment(db, "T-2026-0001", entry({amount:"1.001"}), clock), /decimal places/i);
    assert.throws(() => recordPayment(db, "T-2026-0001", entry({payment_date:"2026-10-24"}), clock), /future/i);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM treatment_payments").get().n, count);
  } finally { db.close(); }
});

test("reversal creates append-only correction and cannot reverse twice", () => {
  const db = setup();
  try {
    const saved = recordPayment(db, "T-2026-0001", entry(), clock);
    const req = { reason: "Incorrect payment amount entered", request_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" };
    const reversed = reversePayment(db, "T-2026-0001", saved.payment.id, req, clock);
    assert.equal(reversed.repeated, false);
    assert.equal(reversePayment(db, "T-2026-0001", saved.payment.id, req, clock).repeated, true);
    assert.throws(() => reversePayment(db, "T-2026-0001", saved.payment.id, { ...req, request_id: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff" }, clock), /already been reversed/);
    const history = listPaymentRows(db, "T-2026-0001", 8000);
    assert.equal(history.length, 3);
    assert.equal(history.find((r) => r.id === saved.payment.id).status, "Reversed");
    assert.equal(history[0].signed_amount, -1500);
    assert.equal(getPaidCents(db, "T-2026-0001"), 200000);
    assert.equal(db.prepare("SELECT balance FROM treatments WHERE treatment_id = 'T-2026-0001'").get().balance, 6000);
  } finally { db.close(); }
});
