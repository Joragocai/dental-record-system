import test from "node:test";
import assert from "node:assert/strict";
import { asPgMoney, fromPgCents, fromPgMoneyCents, normalizePgRow, pgDate, pgTimestamp } from "./format.js";
import { getPostgresDateTypeParser } from "./pool.js";
import pg from "pg";

test("DATE and TIMESTAMPTZ keep API-compatible formats", () => {
  assert.equal(pgDate(new Date("2026-10-23T00:00:00.000Z")), "2026-10-23");
  assert.equal(pgDate("2026-10-23"), "2026-10-23");
  assert.equal(pgTimestamp(new Date("2026-10-23T02:00:00Z")), "2026-10-23T02:00:00.000Z");
  assert.throws(() => pgDate("10/23/2026"), /Invalid/);
});

test("PostgreSQL DATE parser preserves the selected clinic day across timezone offsets", () => {
  const parsers = getPostgresDateTypeParser(pg);
  assert.equal(parsers.getTypeParser(1082, "text")("2026-10-24"), "2026-10-24");
  assert.equal(pgDate(parsers.getTypeParser(1082, "text")("2026-10-24")), "2026-10-24");
  assert.strictEqual(parsers.getTypeParser(1184, "text"), pg.types.getTypeParser(1184, "text"));
});

test("PostgreSQL NUMERIC strings round-trip exact centavos", () => {
  assert.equal(fromPgMoneyCents("0.01"), 1);
  assert.equal(fromPgMoneyCents("123456789012.99"), 12345678901299);
  assert.equal(asPgMoney(12345678901299), "123456789012.99");
  assert.equal(fromPgCents("150000"), 150000);
  assert.throws(() => fromPgCents("9007199254740993"), /safe/);
  assert.throws(() => fromPgMoneyCents("1.001"), /Invalid/);
  assert.throws(() => asPgMoney(-1), /Invalid/);
});

test("PostgreSQL query results normalize date and money types", () => {
  const original = { date_registered: new Date("2026-10-23T00:00:00.000Z"), amount_paid: "500.00",
    updated_at: new Date("2026-10-23T05:00:00Z"), attachment_count: "2" };
  const row = normalizePgRow(original);
  assert.equal(row.date_registered, "2026-10-23");
  assert.equal(row.amount_paid, 500);
  assert.equal(row.updated_at, "2026-10-23T05:00:00.000Z");
  assert.equal(row.attachment_count, 2);
  assert.equal(typeof original.amount_paid, "string");
});
