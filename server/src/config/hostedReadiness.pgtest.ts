import assert from "node:assert/strict";
import test from "node:test";
import { createCachedReadinessChecker } from "./hostedReadiness.js";

test("readiness coalesces concurrent public requests into one database probe", async () => {
  let attempts = 0;
  const gate: { resolve?: (value: boolean) => void } = {};
  const check = createCachedReadinessChecker(
    () => {
      attempts += 1;
      return new Promise<boolean>((resolve) => {
        gate.resolve = resolve;
      });
    },
    { now: () => 1_000, successTtlMs: 15_000, failureTtlMs: 5_000 }
  );

  const requests = Array.from({ length: 100 }, () => check());
  assert.equal(attempts, 1);
  assert.ok(gate.resolve);
  gate.resolve(true);
  assert.deepEqual(await Promise.all(requests), Array(100).fill(true));
  assert.equal(await check(), true);
  assert.equal(attempts, 1, "cached requests must not open new pools or query Postgres");
});

test("successful readiness expires and refreshes after the success TTL", async () => {
  let time = 100;
  let attempts = 0;
  const check = createCachedReadinessChecker(
    async () => {
      attempts++;
      return true;
    },
    { now: () => time, successTtlMs: 20, failureTtlMs: 5 }
  );

  assert.equal(await check(), true);
  time = 119;
  assert.equal(await check(), true);
  assert.equal(attempts, 1);
  time = 120;
  assert.equal(await check(), true);
  assert.equal(attempts, 2);
});

test("unavailable database returns safe false and uses the short failure TTL", async () => {
  let time = 1_000;
  let attempts = 0;
  const check = createCachedReadinessChecker(
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("connection refused with private database details");
      return true;
    },
    { now: () => time, successTtlMs: 100, failureTtlMs: 10 }
  );

  assert.equal(await check(), false);
  assert.equal(await check(), false);
  assert.equal(attempts, 1);
  time = 1_010;
  assert.equal(await check(), true);
  assert.equal(attempts, 2);
});

test("false readiness is cached briefly without masking recovery indefinitely", async () => {
  let time = 1_000;
  let healthy = false;
  let attempts = 0;
  const check = createCachedReadinessChecker(
    async () => {
      attempts++;
      return healthy;
    },
    { now: () => time, successTtlMs: 100, failureTtlMs: 5 }
  );

  assert.equal(await check(), false);
  healthy = true;
  time = 1_004;
  assert.equal(await check(), false);
  assert.equal(attempts, 1);
  time = 1_005;
  assert.equal(await check(), true);
  assert.equal(attempts, 2);
});

test("readiness rejects unsafe cache durations", () => {
  assert.throws(
    () => createCachedReadinessChecker(async () => true, { successTtlMs: 0 }),
    /TTL/
  );
  assert.throws(
    () => createCachedReadinessChecker(async () => true, { failureTtlMs: Number.NaN }),
    /TTL/
  );
});
