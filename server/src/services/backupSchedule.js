export function getNextBackupSchedule({ autoBackupEnabled, isDemoMode, lastAutomaticAt, lastSuccessfulAt, now = new Date(), intervalDays = 7 }) {
  if (!autoBackupEnabled) return { nextBackupDueAt: null, isBackupOverdue: false };

  // In the presentation environment a successful manual snapshot fulfills
  // the same seven-day coverage window as a scheduled snapshot.
  const reference = isDemoMode ? lastSuccessfulAt : lastAutomaticAt;
  const referenceTime = reference ? new Date(reference).getTime() : NaN;
  const nowTime = new Date(now).getTime();
  const nextTime = Number.isFinite(referenceTime)
    ? referenceTime + intervalDays * 86400000
    : nowTime;

  return {
    nextBackupDueAt: new Date(nextTime).toISOString(),
    isBackupOverdue: nextTime <= nowTime
  };
}
