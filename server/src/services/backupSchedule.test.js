import test from "node:test";
import assert from "node:assert/strict";
import { getNextBackupSchedule } from "./backupSchedule.js";

const now = new Date("2026-10-11T04:00:00.000Z");
const manual = "2026-10-11T03:27:49.101Z";

test("demo manual backup fulfills weekly coverage and clears overdue notice", () => {
  const result = getNextBackupSchedule({
    autoBackupEnabled: true, isDemoMode: true, lastSuccessfulAt: manual,
    lastAutomaticAt: null, now
  });
  assert.equal(result.nextBackupDueAt, "2026-10-18T03:27:49.101Z");
  assert.equal(result.isBackupOverdue, false);
});

test("demo becomes due seven days after latest successful snapshot", () => {
  const result = getNextBackupSchedule({
    autoBackupEnabled: true, isDemoMode: true, lastSuccessfulAt: manual,
    now: new Date("2026-10-19T03:27:49.101Z")
  });
  assert.equal(result.isBackupOverdue, true);
});

test("clean clinic still schedules from automatic backups only", () => {
  const result = getNextBackupSchedule({
    autoBackupEnabled: true, isDemoMode: false, lastSuccessfulAt: manual,
    lastAutomaticAt: null, now
  });
  assert.equal(result.isBackupOverdue, true);
});

test("disabled scheduler has no due date", () => {
  const result = getNextBackupSchedule({
    autoBackupEnabled: false, isDemoMode: true, lastSuccessfulAt: manual, now
  });
  assert.deepEqual(result, { nextBackupDueAt: null, isBackupOverdue: false });
});
