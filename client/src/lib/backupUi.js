const manilaDateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

export function formatBackupDateTime(value, emptyText = "—") {
  if (!value) return emptyText;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyText;
  return manilaDateTimeFormatter.format(date);
}

export function formatBackupTypeLabel(value) {
  if (!value) return "";
  if (value === "automatic-weekly") return "Weekly Automatic";
  if (value === "manual") return "Manual";
  return value;
}

export function formatBackupResultLabel(value) {
  if (!value) return "";
  if (value === "success") return "Successful";
  if (value === "failed") return "Failed";
  return value;
}

export function getBackupHeaderDescription(runtimeStatus) {
  if (runtimeStatus?.isDemoMode) {
    return "Protect fictional demo records and attachments. Automatic backups are disabled in Demo Mode.";
  }

  return "Protect patient records, treatment records, and uploaded attachments. Automatic backups run weekly.";
}

export function getLatestBackupDisplay(backupStatus) {
  if (!backupStatus?.lastSuccessfulBackupAt) {
    return {
      primary: "No backups yet",
      secondary: ""
    };
  }

  const primary = formatBackupDateTime(backupStatus.lastSuccessfulBackupAt, "No backups yet");
  if (backupStatus.lastBackupStatus === "success") {
    const typeLabel = formatBackupTypeLabel(backupStatus.lastBackupType);
    const resultLabel = formatBackupResultLabel(backupStatus.lastBackupStatus);
    const secondary = [typeLabel, resultLabel].filter(Boolean).join(" · ");

    return {
      primary,
      secondary
    };
  }

  return {
    primary,
    secondary: "Most recent successful backup"
  };
}

export function getNextBackupDisplay(backupStatus, runtimeStatus) {
  if (runtimeStatus?.isDemoMode) {
    return "Disabled in Demo Mode";
  }

  if (!backupStatus?.nextBackupDueAt) {
    return "Not scheduled";
  }

  return formatBackupDateTime(backupStatus.nextBackupDueAt, "Not scheduled");
}

export function formatRetentionSummary(weeklyCount, monthlyCount) {
  const weekly = Number.isFinite(Number(weeklyCount)) ? Number(weeklyCount) : 0;
  const monthly = Number.isFinite(Number(monthlyCount)) ? Number(monthlyCount) : 0;
  const weeklyLabel = `${weekly} recent weekly`;
  const monthlyLabel = `${monthly} monthly ${monthly === 1 ? "archive" : "archives"}`;
  return `${weeklyLabel} · ${monthlyLabel}`;
}

export function getManualBackupButtonState({ backupStatus, isLoading, isCreatingBackup }) {
  const backupInProgress = Boolean(backupStatus?.backupInProgress);
  return {
    disabled: isLoading || !backupStatus || isCreatingBackup || backupInProgress,
    label: isCreatingBackup || backupInProgress ? "Creating Backup…" : "Create Backup",
    isBusy: isCreatingBackup || backupInProgress
  };
}
