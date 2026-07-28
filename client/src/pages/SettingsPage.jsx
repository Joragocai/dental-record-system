import { useCallback, useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { createBackup, getBackupStatus } from "../lib/api";

const manilaDateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return manilaDateTimeFormatter.format(date);
}

function formatBackupType(value) {
  if (!value) return "—";
  if (value === "automatic-weekly") return "Weekly Automatic Backup";
  if (value === "manual") return "Manual Backup";
  return value;
}

function formatBackupResult(value) {
  if (!value) return "—";
  if (value === "success") return "Successful";
  if (value === "failed") return "Failed";
  return value;
}

export default function SettingsPage() {
  const [backupStatus, setBackupStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("info");
  const requestInFlightRef = useRef(false);
  const intervalRef = useRef(null);

  const loadBackupStatus = useCallback(async (showLoading = false) => {
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const data = await getBackupStatus();
      setBackupStatus(data);
    } catch (error) {
      setStatus(error.response?.data?.message || "Unable to load backup status.");
      setStatusTone("error");
    } finally {
      requestInFlightRef.current = false;
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadBackupStatus(true);

    function handleFocus() {
      loadBackupStatus(false);
    }

    intervalRef.current = window.setInterval(() => {
      if (!document.hidden) {
        loadBackupStatus(false);
      }
    }, 60000);

    window.addEventListener("focus", handleFocus);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadBackupStatus]);

  async function handleBackup() {
    if (isCreatingBackup || backupStatus?.backupInProgress) return;

    setIsCreatingBackup(true);
    try {
      const data = await createBackup();
      setStatus(data.message || `Backup completed successfully. Database and uploaded files were copied to ${data.backup_path}.`);
      setStatusTone("success");
      await loadBackupStatus(false);
    } catch (error) {
      setStatus(error.response?.data?.message || "Unable to create backup.");
      setStatusTone("error");
    } finally {
      setIsCreatingBackup(false);
    }
  }

  const showWarning = backupStatus?.lastBackupStatus === "failed" || backupStatus?.isBackupOverdue;

  return (
    <Layout>
      <section className="mx-auto max-w-3xl">
        <div className="page-card">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-clinic-700">System Maintenance</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Backup</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Create a timestamped backup of patient records, treatment records, and uploaded patient/treatment attachments.
            </p>
          </div>

          {showWarning && (
            <div className="feedback-message mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              {backupStatus?.lastBackupStatus === "failed"
                ? `The last backup failed. ${backupStatus?.lastBackupError || "Please review the backup destination and try again."}`
                : "Automatic backup is overdue. Run a manual backup now if needed and keep the application running so the next automatic backup can complete."}
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Automatic Backup</p>
              <p className="mt-2 text-base font-semibold text-slate-900">
                {isLoading ? "Loading..." : backupStatus?.automaticBackupEnabled ? "Enabled" : "Disabled"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Frequency</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{isLoading ? "Loading..." : backupStatus?.automaticBackupFrequency || "Weekly"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Last Successful Backup</p>
              <p className="mt-2 text-sm font-medium text-slate-900">{isLoading ? "Loading..." : formatDateTime(backupStatus?.lastSuccessfulBackupAt)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Last Automatic Backup</p>
              <p className="mt-2 text-sm font-medium text-slate-900">{isLoading ? "Loading..." : formatDateTime(backupStatus?.lastAutomaticBackupAt)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Last Manual Backup</p>
              <p className="mt-2 text-sm font-medium text-slate-900">{isLoading ? "Loading..." : formatDateTime(backupStatus?.lastManualBackupAt)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Next Backup Due</p>
              <p className="mt-2 text-sm font-medium text-slate-900">{isLoading ? "Loading..." : formatDateTime(backupStatus?.nextBackupDueAt)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Backup Destination</p>
              <p className="mt-2 break-all text-sm font-medium text-slate-900">{isLoading ? "Loading..." : backupStatus?.backupDestination || "—"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Last Backup Type</p>
              <p className="mt-2 text-sm font-medium text-slate-900">{isLoading ? "Loading..." : formatBackupType(backupStatus?.lastBackupType)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Last Backup Result</p>
              <p className="mt-2 text-sm font-medium text-slate-900">{isLoading ? "Loading..." : formatBackupResult(backupStatus?.lastBackupStatus)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Weekly Backups Retained</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{isLoading ? "Loading..." : backupStatus?.retainedWeeklyCount ?? "—"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Monthly Archives Retained</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{isLoading ? "Loading..." : backupStatus?.retainedMonthlyCount ?? "—"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="px-1 text-xs text-slate-500">A monthly archive may also be one of the retained weekly backups.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Backup In Progress</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {isLoading ? "Loading..." : backupStatus?.backupInProgress || isCreatingBackup ? "Yes" : "No"}
              </p>
              {backupStatus?.lastBackupError && (
                <p className="mt-2 text-sm text-rose-700">Last error: {backupStatus.lastBackupError}</p>
              )}
            </div>
          </div>

          <div className="mt-6 no-print">
            <button
              className="button-primary"
              onClick={handleBackup}
              disabled={isLoading || isCreatingBackup || backupStatus?.backupInProgress}
            >
              {isCreatingBackup || backupStatus?.backupInProgress ? "Creating Backup..." : "Create Backup"}
            </button>
          </div>

          {status && (
            <p
              className={`feedback-message mt-5 rounded-xl px-4 py-3 text-sm ${
                statusTone === "success"
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
              }`}
            >
              {status}
            </p>
          )}
        </div>
      </section>
    </Layout>
  );
}
