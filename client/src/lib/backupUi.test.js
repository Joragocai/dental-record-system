import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRetentionSummary,
  getBackupHeaderDescription,
  getLatestBackupDisplay,
  getManualBackupButtonState,
  getNextBackupDisplay
} from "./backupUi.ts";

test("clean mode header description says automatic backups run weekly", () => {
  assert.equal(
    getBackupHeaderDescription({ isDemoMode: false }),
    "Protect patient records, treatment records, and uploaded attachments. Automatic backups run weekly."
  );
});

test("demo mode header description says automatic backups are disabled", () => {
  assert.equal(
    getBackupHeaderDescription({ isDemoMode: true }),
    "Protect fictional demo records and attachments. Automatic backups are disabled in Demo Mode."
  );
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

test("next backup shows demo disabled state from runtime mode", () => {
  assert.equal(
    getNextBackupDisplay({ nextBackupDueAt: "2026-08-04T13:10:00.000Z" }, { isDemoMode: true }),
    "Disabled in Demo Mode"
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
