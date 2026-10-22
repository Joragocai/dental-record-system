import test from "node:test";
import assert from "node:assert/strict";
import { getManilaTodayIso, toIsoDateString } from "./dateUtils.js";

test("clinic calendar date advances at midnight in Manila, not midnight UTC", () => {
  assert.equal(getManilaTodayIso(new Date("2026-10-11T15:59:59Z")), "2026-10-11");
  assert.equal(getManilaTodayIso(new Date("2026-10-11T16:00:00Z")), "2026-10-12");
  assert.equal(getManilaTodayIso(new Date("2026-10-11T23:42:00Z")), "2026-10-12");
  assert.equal(getManilaTodayIso(new Date("2026-12-31T16:00:00Z")), "2027-01-01");
});

test("patient registration default is the Manila date even when server runs on UTC", () => {
  assert.equal(toIsoDateString(new Date("2026-10-11T23:42:00Z")), "2026-10-12");
});
