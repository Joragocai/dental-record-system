import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNullablePgDateOnly, normalizePgDateOnly } from "./dateOnly.js";

test("normalizePgDateOnly preserves PostgreSQL DATE strings", () => {
  assert.equal(normalizePgDateOnly("2026-08-01", "Test date"), "2026-08-01");
});

test("normalizePgDateOnly preserves local calendar parts when PostgreSQL returns a Date", () => {
  const localMidnight = new Date(2026, 7, 1, 0, 0, 0);
  assert.equal(normalizePgDateOnly(localMidnight, "Test date"), "2026-08-01");
});

test("normalizeNullablePgDateOnly preserves null", () => {
  assert.equal(normalizeNullablePgDateOnly(null, "Optional test date"), null);
});

test("normalizePgDateOnly rejects malformed strings", () => {
  assert.throws(() => normalizePgDateOnly("08/01/2026", "Test date"), /YYYY-MM-DD/);
});
