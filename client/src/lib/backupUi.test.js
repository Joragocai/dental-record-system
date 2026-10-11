import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRetentionSummary,
  formatBackupDateTime,
  getBackupHeaderDescription,
  getLatestBackupDisplay,
  getManualBackupButtonState,
  getNextBackupDisplay
} from "./backupUi.js";

test("backup header explains routine protection and on-demand backups", () => {
  const expected = "Protect your clinic's patient records, treatment information, and uploaded files through automatic weekly and on-demand backups. Review backup history, schedules, and retention details below.";
  assert.equal(getBackupHeaderDescription({ isDemoMode: false }), expected);
  assert.equal(getBackupHeaderDescription({ isDemoMode: true }), expected);
  assert.doesNotMatch(expected, /fictional/i);
});

test("latest backup combines timestamp, type, and successful result when the latest backup succeeded", () => {
  const display = getLatestBackupDisplay({
    lastSuccessfulBackupAt: "2026-07-28T13:10:00.000Z",
    lastBackupType: "automatic-weekly",
    lastBackupStatus: "success"
  });

  assert.match(display.primary, /2026/);
  assert.equal(display.secondary, "Weekly Automatic · Successful");
});

test("latest backup shows a safe empty state when no backup exists", () => {
  assert.deepEqual(getLatestBackupDisplay({}), {
    primary: "No backups yet",
    secondary: ""
  });
});

test("next backup shows due date in demo mode", () => {
  assert.equal(
    getNextBackupDisplay({ nextBackupDueAt: "2026-08-04T13:10:00.000Z" }, { isDemoMode: true }),
    formatBackupDateTime("2026-08-04T13:10:00.000Z")
  );
});

test("next backup shows not scheduled when clean mode has no due date", () => {
  assert.equal(getNextBackupDisplay({ nextBackupDueAt: null }, { isDemoMode: false }), "Not scheduled");
});

test("retention summary combines weekly and monthly counts with singular and plural wording", () => {
  assert.equal(formatRetentionSummary(1, 1), "1 recent weekly · 1 monthly archive");
  assert.equal(formatRetentionSummary(2, 3), "2 recent weekly · 3 monthly archives");
});

test("manual backup button stays disabled while loading, while creating, and while backend reports backup in progress", () => {
  assert.deepEqual(
    getManualBackupButtonState({
      backupStatus: null,
      isLoading: true,
      isCreatingBackup: false
    }),
    {
      disabled: true,
      label: "Create Backup",
      isBusy: false
    }
  );

  assert.deepEqual(
    getManualBackupButtonState({
      backupStatus: { backupInProgress: true },
      isLoading: false,
      isCreatingBackup: false
    }),
    {
      disabled: true,
      label: "Creating Backup…",
      isBusy: true
    }
  );

  assert.deepEqual(
    getManualBackupButtonState({
      backupStatus: { backupInProgress: false },
      isLoading: false,
      isCreatingBackup: true
    }),
    {
      disabled: true,
      label: "Creating Backup…",
      isBusy: true
    }
  );

  assert.deepEqual(
    getManualBackupButtonState({
      backupStatus: { backupInProgress: false },
      isLoading: false,
      isCreatingBackup: false
    }),
    {
      disabled: false,
      label: "Create Backup",
      isBusy: false
    }
  );
});
