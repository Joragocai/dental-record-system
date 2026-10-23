import test from "node:test";
import assert from "node:assert/strict";
import { registerFinanceBroadcaster, publishFinanceChange } from "./financeEvents.js";

test("finance changes broadcast a data-free notification", () => {
  const changes = [];
  const unregister = registerFinanceBroadcaster((event) => changes.push(event));
  try {
    publishFinanceChange();
    assert.equal(changes.length, 1);
    assert.deepEqual(Object.keys(changes[0]), ["changedAt"]);
    assert.equal(Number.isFinite(Date.parse(changes[0].changedAt)), true);
  } finally {
    unregister();
  }
});

test("unregistering a broadcaster prevents further notifications", () => {
  const changes = [];
  const unregister = registerFinanceBroadcaster((event) => changes.push(event));
  unregister();
  publishFinanceChange();
  assert.equal(changes.length, 0);
});
