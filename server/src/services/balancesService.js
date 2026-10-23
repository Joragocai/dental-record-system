import { buildPatientDisplayName } from "../utils/patientUtils.js";
import { toCents } from "../utils/paymentValidation.js";
import { fromCents } from "./paymentLedger.js";

export function getBalancesReport(database) {
  const records = database.prepare(
    `SELECT t.treatment_id, t.patient_id, t.treatment_date, t.procedure,
            t.amount_charged, t.discount_amount, t.net_amount_due, t.amount_paid, t.balance,
            p.first_name, p.middle_name, p.last_name, p.mobile_number, p.branch_location
     FROM treatments t
     JOIN patients p ON p.patient_id = t.patient_id
     ORDER BY t.treatment_date DESC, t.treatment_id DESC`
  ).all().map((row) => {
    const due = toCents(row.net_amount_due) ?? 0;
    const paid = toCents(row.amount_paid) ?? 0;
    const remaining = Math.max(0, due - paid);
    return {
      ...row,
      patient_name: buildPatientDisplayName(row),
      net_amount_due: fromCents(due),
      amount_paid: fromCents(paid),
      balance: fromCents(remaining),
      payment_status: remaining === 0 ? "Settled" : paid > 0 ? "Partially Paid" : "Unpaid"
    };
  });
  const openRecords = records.filter((row) => row.balance > 0);
  return {
    summary: {
      outstanding_total: fromCents(openRecords.reduce((sum, row) => sum + (toCents(row.balance) ?? 0), 0)),
      treatments_with_balance: openRecords.length,
      patients_with_balance: new Set(openRecords.map((row) => row.patient_id)).size,
      settled_treatments: records.length - openRecords.length
    },
    records
  };
}

export function getPatientFinancialSummary(database, patientId) {
  const { records } = getBalancesReport(database);
  const owned = records.filter((row) => row.patient_id === patientId);
  const cents = (field) => fromCents(owned.reduce((sum, row) => sum + (toCents(row[field]) ?? 0), 0));
  return {
    net_due: cents("net_amount_due"),
    total_paid: cents("amount_paid"),
    outstanding: cents("balance"),
    open_treatments: owned.filter((row) => row.balance > 0).length,
    treatment_count: owned.length
  };
}
