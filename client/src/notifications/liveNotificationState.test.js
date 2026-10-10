import assert from "node:assert/strict";
import test from "node:test";
import { countNewUnreadNotifications } from "./liveNotificationState.js";

function notification(id, createdAt, readAt = null) {
  return { id, createdAt, readAt };
}

test("initial notification history is a baseline, not a popup", () => {
  const existing = [notification("old", "2026-10-10T01:00:00.000Z")];
  assert.equal(countNewUnreadNotifications(null, existing), 0);
  assert.equal(countNewUnreadNotifications(null, []), 0);
});

test("new unread notifications trigger once, and unread history does not replay", () => {
  const old = notification("old", "2026-10-10T01:00:00.000Z");
  const firstNew = notification("first", "2026-10-10T01:01:00.000Z");
  const secondNew = notification("second", "2026-10-10T01:02:00.000Z");
  assert.equal(countNewUnreadNotifications([old], [secondNew, firstNew, old]), 2);
  assert.equal(countNewUnreadNotifications([secondNew, firstNew, old], [secondNew, firstNew, old]), 0);
  assert.equal(countNewUnreadNotifications([], [firstNew]), 1);
});

test("read or older backfilled notifications never trigger popups", () => {
  const previous = [notification("old", "2026-10-10T02:00:00.000Z")];
  const backfilled = notification("backfilled", "2026-10-10T01:55:00.000Z");
  const alreadyRead = notification("read", "2026-10-10T02:01:00.000Z", "2026-10-10T02:02:00.000Z");
  const invalidTime = notification("invalid", "not-a-date");
  const equalTime = notification("equal", "2026-10-10T02:00:00.000Z");
  assert.equal(countNewUnreadNotifications(previous, [alreadyRead, invalidTime, backfilled, equalTime, ...previous]), 1);
});
