import { getManilaTodayIso } from "../../utils/dateUtils.js";
import { validatePaymentInput, toCents } from "../../utils/paymentValidation.js";
import { asPgMoney, fromPgCents, fromPgMoneyCents, normalizePgRow } from "./format.js";
import { withPostgresTransaction } from "./pool.js";

function rejection(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

const money = (cents) => Number(asPgMoney(cents));

async function lockedTreatment(client, treatmentId) {
  const { rows } = await client.query(
    "SELECT treatment_id, treatment_date, net_amount_due FROM public.treatments WHERE treatment_id = $1 FOR UPDATE",
    [treatmentId]
  );
  if (!rows.length) throw rejection("Treatment not found.", 404);
  return normalizePgRow(rows[0]);
}

async function totalPaidCents(client, treatmentId) {
  const { rows } = await client.query(
    "SELECT COALESCE(SUM(amount_cents), 0)::text AS total FROM public.treatment_payments WHERE treatment_id = $1",
    [treatmentId]
  );
  return fromPgCents(rows[0]?.total ?? 0);
}

function isSamePayment(row, treatmentId, input) {
  const value = normalizePgRow(row);
  return value.source === "recorded" && value.treatment_id === treatmentId &&
    fromPgCents(value.amount_cents) === toCents(input?.amount) &&
    value.payment_date === String(input?.payment_date || "").trim() &&
    value.payment_method === String(input?.payment_method || "").trim() &&
    value.reference === String(input?.reference || "").trim() &&
    value.notes === String(input?.notes || "").trim();
}

export async function recordPostgresPayment(pool, treatmentId, input, now = new Date()) {
  try {
    return await withPostgresTransaction(async (client) => {
      // FOR UPDATE serializes payments to the same treatment, preventing overpayment races.
      const treatment = await lockedTreatment(client, treatmentId);
      const requestId = String(input?.request_id || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw rejection("Invalid payment request identifier.");
      const previous = await client.query("SELECT * FROM public.treatment_payments WHERE request_id = $1", [requestId]);
      if (previous.rows[0]) {
        if (!isSamePayment(previous.rows[0], treatmentId, input)) {
          throw rejection("This payment request identifier was already used for different details.", 409);
        }
        return { repeated: true, payment: normalizePgRow(previous.rows[0]) };
      }

      const paidCents = await totalPaidCents(client, treatmentId);
      const dueCents = fromPgMoneyCents(treatment.net_amount_due);
      const { errors, data } = validatePaymentInput(input, {
        treatmentDate: treatment.treatment_date,
        balanceCents: dueCents - paidCents,
        today: getManilaTodayIso(now)
      });
      if (errors.length) throw rejection(errors[0]);
      const { rows: inserted } = await client.query(
        `INSERT INTO public.treatment_payments
          (treatment_id, amount_cents, payment_date, payment_method, reference, notes, source, request_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'recorded', $7, $8) RETURNING *`,
        [treatmentId, data.amount_cents, data.payment_date, data.payment_method, data.reference, data.notes,
          data.request_id, now.toISOString()]
      );
      const nextPaid = paidCents + data.amount_cents;
      await client.query(
        "UPDATE public.treatments SET amount_paid = $1, balance = $2, updated_at = $3 WHERE treatment_id = $4",
        [asPgMoney(nextPaid), asPgMoney(dueCents - nextPaid), now.toISOString(), treatmentId]
      );
      return { repeated: false, payment: normalizePgRow(inserted[0]) };
    }, pool);
  } catch (error) {
    if (error.code === "23505") throw rejection("This payment request was already recorded.", 409);
    throw error;
  }
}

export async function reversePostgresPayment(pool, treatmentId, paymentId, input, now = new Date()) {
  try {
    return await withPostgresTransaction(async (client) => {
      const treatment = await lockedTreatment(client, treatmentId);
      const requestId = String(input?.request_id || "").trim();
      const reason = String(input?.reason || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw rejection("Invalid reversal request identifier.");
      if (reason.length < 8 || reason.length > 500) throw rejection("Provide a reversal reason of 8 to 500 characters.");
      const prior = await client.query("SELECT * FROM public.treatment_payments WHERE request_id = $1", [requestId]);
      if (prior.rows[0]) {
        const saved = normalizePgRow(prior.rows[0]);
        if (saved.source !== "reversal" || saved.treatment_id !== treatmentId ||
          Number(saved.reverses_payment_id) !== Number(paymentId) || saved.notes !== reason) {
          throw rejection("This reversal request identifier was already used for different details.", 409);
        }
        return { repeated: true, reversal: saved };
      }
      const { rows } = await client.query(
        "SELECT * FROM public.treatment_payments WHERE id = $1 AND treatment_id = $2",
        [paymentId, treatmentId]
      );
      const original = rows[0];
      if (!original) throw rejection("Payment not found.", 404);
      if (!["initial", "recorded"].includes(original.source)) {
        throw rejection("This transaction is not eligible for reversal.");
      }
      const reversed = await client.query("SELECT id FROM public.treatment_payments WHERE reverses_payment_id = $1", [paymentId]);
      if (reversed.rows.length) throw rejection("This payment has already been reversed.", 409);

      const paidCents = await totalPaidCents(client, treatmentId);
      const dueCents = fromPgMoneyCents(treatment.net_amount_due);
      const reversedCents = fromPgCents(original.amount_cents);
      if (reversedCents <= 0 || paidCents < reversedCents) throw rejection("Invalid payment ledger state.", 409);
      const { rows: inserted } = await client.query(
        `INSERT INTO public.treatment_payments
          (treatment_id, amount_cents, payment_date, payment_method, reference, notes, source,
           reverses_payment_id, request_id, created_at)
         VALUES ($1, $2, $3, 'Not recorded', '', $4, 'reversal', $5, $6, $7) RETURNING *`,
        [treatmentId, -reversedCents, getManilaTodayIso(now), reason, paymentId, requestId, now.toISOString()]
      );
      const nextPaid = paidCents - reversedCents;
      await client.query(
        "UPDATE public.treatments SET amount_paid = $1, balance = $2, updated_at = $3 WHERE treatment_id = $4",
        [asPgMoney(nextPaid), asPgMoney(dueCents - nextPaid), now.toISOString(), treatmentId]
      );
      return { repeated: false, reversal: normalizePgRow(inserted[0]) };
    }, pool);
  } catch (error) {
    if (error.code === "23505") throw rejection("This payment has already been reversed or this request was already used.", 409);
    throw error;
  }
}

export async function listPostgresPaymentRows(client, treatmentId, netDue) {
  const { rows } = await client.query(
    "SELECT * FROM public.treatment_payments WHERE treatment_id = $1 ORDER BY id ASC",
    [treatmentId]
  );
  const reversed = new Set(rows.filter((item) => item.source === "reversal").map((item) => Number(item.reverses_payment_id)));
  const dueCents = fromPgMoneyCents(netDue);
  let running = 0;
  return rows.map((raw) => {
    const row = normalizePgRow(raw);
    const amount = fromPgCents(row.amount_cents);
    running += amount;
    return {
      ...row,
      amount: money(Math.abs(amount)),
      signed_amount: amount / 100,
      balance_after: money(dueCents - running),
      status: row.source === "reversal" ? "Correction" : reversed.has(Number(row.id)) ? "Reversed" : "Recorded",
      transaction_number: `${row.source === "reversal" ? "REV" : "PAY"}-${String(row.id).padStart(6, "0")}`
    };
  }).reverse();
}
