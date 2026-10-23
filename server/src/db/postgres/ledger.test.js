import test from "node:test";
import assert from "node:assert/strict";
import { recordPostgresPayment, reversePostgresPayment, listPostgresPaymentRows } from "./ledger.js";

const timestamp = new Date("2026-10-23T03:00:00Z");
const payment = { amount: "1500.00", payment_date: "2026-10-23", payment_method: "GCash",
  reference: "DEMO", notes: "Fake payment", request_id: "12345678-1234-1234-1234-123456789abc" };
function clientStub({ due = "8000.00", paid = "200000", previous = null } = {}) {
  const calls = [];
  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("FROM public.treatments") && sql.includes("FOR UPDATE")) {
      return { rows: [{ treatment_id: "T-2026-0001", treatment_date: "2026-10-10", net_amount_due: due }] };
    }
    if (sql.includes("WHERE request_id")) return { rows: previous ? [previous] : [] };
    if (sql.includes("SUM(amount_cents)")) return { rows: [{ total: paid }] };
    if (sql.includes("RETURNING *")) return { rows: [{
      id: 22, treatment_id: "T-2026-0001", source: sql.includes("'reversal'") ? "reversal" : "recorded",
      amount_cents: sql.includes("'reversal'") ? -150000 : 150000,
      request_id: payment.request_id, payment_date: "2026-10-23", payment_method: "GCash",
      reference: "DEMO", notes: "Fake payment"
    }] };
    if (sql.includes("WHERE id = $1")) return { rows: [{ id: 22, treatment_id: "T-2026-0001", source: "recorded", amount_cents: "150000" }] };
    return { rows: [] };
  };
  const client = { query, release: () => calls.push({ sql: "RELEASE" }) };
  return { pool: { connect: async () => client }, calls };
}

test("PostgreSQL payment serializes writes via row lock and updates balance atomically", async () => {
  const { pool, calls } = clientStub();
  const result = await recordPostgresPayment(pool, "T-2026-0001", payment, timestamp);
  assert.equal(result.repeated, false);
  assert.equal(calls[0].sql, "BEGIN");
  assert.match(calls[1].sql, /FOR UPDATE/);
  const update = calls.find(({ sql }) => sql.startsWith("UPDATE public.treatments"));
  assert.deepEqual(update.params.slice(0, 2), ["3500.00", "4500.00"]);
  assert.equal(calls.at(-2).sql, "COMMIT");
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("PostgreSQL payment rejects overpayment and rolls back without insert", async () => {
  const { pool, calls } = clientStub({ due: "3000.00", paid: "200000" });
  await assert.rejects(recordPostgresPayment(pool, "T-2026-0001", payment, timestamp), /cannot exceed/i);
  assert.equal(calls.some(({ sql }) => sql.includes("INSERT INTO")), false);
  assert.equal(calls.at(-2).sql, "ROLLBACK");
});

test("identical payment retry is idempotent", async () => {
  const { pool, calls } = clientStub({ previous: { id: 18, source: "recorded", treatment_id: "T-2026-0001",
    amount_cents: "150000", payment_date: "2026-10-23", payment_method: "GCash", reference: "DEMO", notes: "Fake payment" } });
  const result = await recordPostgresPayment(pool, "T-2026-0001", payment, timestamp);
  assert.equal(result.repeated, true);
  assert.equal(calls.some(({ sql }) => sql.includes("INSERT INTO")), false);
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("reversal inserts negative compensating entry without deleting original", async () => {
  const { pool, calls } = clientStub({ paid: "350000" });
  const input = { reason: "Payment entered incorrectly", request_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" };
  const result = await reversePostgresPayment(pool, "T-2026-0001", 22, input, timestamp);
  assert.equal(result.repeated, false);
  const inserted = calls.find(({ sql }) => sql.includes("INSERT INTO public.treatment_payments"));
  assert.equal(inserted.params[1], -150000);
  assert.equal(calls.some(({ sql }) => sql.startsWith("DELETE")), false);
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("payment history marks reversals and preserves chronological balances", async () => {
  const rows = [
    { id: 1, source: "opening", amount_cents: "200000" },
    { id: 2, source: "recorded", amount_cents: "150000" },
    { id: 3, source: "reversal", amount_cents: "-150000", reverses_payment_id: 2 }
  ];
  const result = await listPostgresPaymentRows({ query: async () => ({ rows }) }, "T-2026-0001", "8000.00");
  assert.equal(result.length, 3);
  assert.equal(result[0].status, "Correction");
  assert.equal(result[1].status, "Reversed");
  assert.equal(result[0].balance_after, 6000);
});
