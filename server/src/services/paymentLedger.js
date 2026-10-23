import { getManilaTodayIso } from "../utils/dateUtils.js";
import { toCents, validatePaymentInput } from "../utils/paymentValidation.js";

export function fromCents(value) {
  return Number((Number(value || 0) / 100).toFixed(2));
}

export function getPaidCents(database, treatmentId) {
  const row = database.prepare(
    "SELECT COALESCE(SUM(amount_cents), 0) AS total FROM treatment_payments WHERE treatment_id = ?"
  ).get(treatmentId);
  return Number(row?.total || 0);
}

function badRequest(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getPaymentRow(database, id) {
  return database.prepare(
    "SELECT * FROM treatment_payments WHERE id = ?"
  ).get(id);
}

export function listPaymentRows(database, treatmentId, netDue) {
  const rows = database.prepare(
    "SELECT * FROM treatment_payments WHERE treatment_id = ? ORDER BY id ASC"
  ).all(treatmentId);
  const dueCents = toCents(netDue) ?? 0;
  const reversed = new Set(rows.filter((row) => row.source === "reversal").map((row) => Number(row.reverses_payment_id)));
  let runningCents = 0;
  return rows.map((row) => {
    runningCents += Number(row.amount_cents);
    return {
      ...row,
      amount: fromCents(Math.abs(row.amount_cents)),
      signed_amount: fromCents(row.amount_cents),
      balance_after: fromCents(dueCents - runningCents),
      status: row.source === "reversal" ? "Correction" : reversed.has(Number(row.id)) ? "Reversed" : "Recorded",
      transaction_number: `${row.source === "reversal" ? "REV" : "PAY"}-${String(row.id).padStart(6, "0")}`
    };
  }).reverse();
}

export function addInitialPayment(database, { treatmentId, amountPaid, treatmentDate, paymentMethod, createdAt }) {
  const amountCents = toCents(amountPaid);
  if (amountCents === null || amountCents < 0) throw badRequest("Initial payment is invalid.");
  if (!amountCents) return;
  database.prepare(
    `INSERT INTO treatment_payments
       (treatment_id, amount_cents, payment_date, payment_method, reference, notes, source, created_at)
     VALUES (?, ?, ?, ?, '', '', 'initial', ?)`
  ).run(treatmentId, amountCents, treatmentDate, paymentMethod || "Not recorded", createdAt);
}

export function recordPayment(database, treatmentId, input, now = new Date()) {
  database.exec("SAVEPOINT record_payment");
  try {
    const requestId = String(input?.request_id || "").trim();
    if (requestId) {
      const previous = database.prepare("SELECT * FROM treatment_payments WHERE request_id = ?").get(requestId);
      if (previous) {
        const same = previous.source === "recorded" && previous.treatment_id === treatmentId &&
          previous.amount_cents === toCents(input?.amount) &&
          previous.payment_date === String(input?.payment_date || "").trim() &&
          previous.payment_method === String(input?.payment_method || "").trim() &&
          previous.reference === String(input?.reference || "").trim() &&
          previous.notes === String(input?.notes || "").trim();
        if (!same) throw badRequest("This payment request identifier was already used for different details.", 409);
        database.exec("RELEASE SAVEPOINT record_payment");
        return { payment: previous, repeated: true };
      }
    }

    const treatment = database.prepare(
      "SELECT treatment_id, treatment_date, net_amount_due FROM treatments WHERE treatment_id = ?"
    ).get(treatmentId);
    if (!treatment) throw badRequest("Treatment not found.", 404);
    const paidCents = getPaidCents(database, treatmentId);
    const dueCents = toCents(treatment.net_amount_due);
    const { errors, data } = validatePaymentInput(input, {
      treatmentDate: treatment.treatment_date,
      balanceCents: (dueCents ?? 0) - paidCents,
      today: getManilaTodayIso(now)
    });
    if (errors.length) throw badRequest(errors[0]);

    const result = database.prepare(
      `INSERT INTO treatment_payments
         (treatment_id, amount_cents, payment_date, payment_method, reference, notes, source, request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'recorded', ?, ?)`
    ).run(treatmentId, data.amount_cents, data.payment_date, data.payment_method,
      data.reference, data.notes, data.request_id, now.toISOString());

    const updatedPaid = paidCents + data.amount_cents;
    database.prepare(
      "UPDATE treatments SET amount_paid = ?, balance = ?, updated_at = ? WHERE treatment_id = ?"
    ).run(fromCents(updatedPaid), fromCents(dueCents - updatedPaid), now.toISOString(), treatmentId);
    const payment = getPaymentRow(database, result.lastInsertRowid);
    database.exec("RELEASE SAVEPOINT record_payment");
    return { payment, repeated: false };
  } catch (error) {
    database.exec("ROLLBACK TO SAVEPOINT record_payment");
    database.exec("RELEASE SAVEPOINT record_payment");
    throw error;
  }
}

export function reversePayment(database, treatmentId, paymentId, input, now = new Date()) {
  database.exec("SAVEPOINT reverse_payment");
  try {
    const requestId = String(input?.request_id || "").trim();
    const reason = String(input?.reason || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw badRequest("Invalid reversal request identifier.");
    if (reason.length < 8 || reason.length > 500) throw badRequest("Provide a reversal reason of 8 to 500 characters.");
    const previousRequest = database.prepare("SELECT * FROM treatment_payments WHERE request_id = ?").get(requestId);
    if (previousRequest) {
      if (previousRequest.source !== "reversal" || previousRequest.treatment_id !== treatmentId ||
          previousRequest.reverses_payment_id !== Number(paymentId) || previousRequest.notes !== reason) {
        throw badRequest("This reversal request identifier was already used for different details.", 409);
      }
      database.exec("RELEASE SAVEPOINT reverse_payment");
      return { reversal: previousRequest, repeated: true };
    }

    const original = getPaymentRow(database, Number(paymentId));
    if (!original || original.treatment_id !== treatmentId) throw badRequest("Payment not found.", 404);
    if (!["initial", "recorded"].includes(original.source)) {
      throw badRequest("This transaction is not eligible for reversal.");
    }
    if (database.prepare("SELECT id FROM treatment_payments WHERE reverses_payment_id = ?").get(original.id)) {
      throw badRequest("This payment has already been reversed.", 409);
    }
    const treatment = database.prepare("SELECT net_amount_due FROM treatments WHERE treatment_id = ?").get(treatmentId);
    if (!treatment) throw badRequest("Treatment not found.", 404);
    const paidCents = getPaidCents(database, treatmentId);
    const result = database.prepare(
      `INSERT INTO treatment_payments
         (treatment_id, amount_cents, payment_date, payment_method, reference, notes,
          source, reverses_payment_id, request_id, created_at)
       VALUES (?, ?, ?, 'Not recorded', '', ?, 'reversal', ?, ?, ?)`
    ).run(treatmentId, -original.amount_cents, getManilaTodayIso(now),
      reason, original.id, requestId, now.toISOString());

    const newPaid = paidCents - original.amount_cents;
    const dueCents = toCents(treatment.net_amount_due);
    database.prepare("UPDATE treatments SET amount_paid = ?, balance = ?, updated_at = ? WHERE treatment_id = ?")
      .run(fromCents(newPaid), fromCents(dueCents - newPaid), now.toISOString(), treatmentId);
    const reversal = getPaymentRow(database, result.lastInsertRowid);
    database.exec("RELEASE SAVEPOINT reverse_payment");
    return { reversal, repeated: false };
  } catch (error) {
    database.exec("ROLLBACK TO SAVEPOINT reverse_payment");
    database.exec("RELEASE SAVEPOINT reverse_payment");
    throw error;
  }
}
