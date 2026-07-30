import { useCallback, useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { useRuntimeStatus } from "../context/RuntimeStatusContext";
import { createBackup, getBackupStatus } from "../lib/api";
import {
  formatBackupDateTime,
  formatRetentionSummary,
  getBackupHeaderDescription,
  getLatestBackupDisplay,
  getManualBackupButtonState,
  getNextBackupDisplay
} from "../lib/backupUi";

function OverviewItem({ label, primary, secondary }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-slate-900">{primary}</p>
      {secondary ? (
        <p className="mt-1 text-sm text-slate-600">{secondary}</p>
      ) : null}
    </div>
  );
}

export default function SettingsPage() {
  const runtimeStatus = useRuntimeStatus();
  const [backupStatus, setBackupStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("info");
  const requestInFlightRef = useRef(false);
  const intervalRef = useRef(null);

  const loadBackupStatus = useCallback(async (showLoading = false) => {
    if (requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;

    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const data = await getBackupStatus();
      setBackupStatus(data);
    } catch (error) {
      setStatus(
        error.response?.data?.message || "Unable to load backup status."
      );
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
    if (isCreatingBackup || backupStatus?.backupInProgress) {
      return;
    }

    setIsCreatingBackup(true);
    setStatus("");

    try {
      await createBackup();
      setStatus("Backup created successfully.");
      setStatusTone("success");
      await loadBackupStatus(false);
    } catch (error) {
      setStatus(
        error.response?.data?.message || "Backup failed. Please try again."
      );
      setStatusTone("error");
    } finally {
      setIsCreatingBackup(false);
    }
  }

  const showWarning =
    backupStatus?.lastBackupStatus === "failed" ||
    backupStatus?.isBackupOverdue;

  const latestBackup = getLatestBackupDisplay(backupStatus);

  const buttonState = getManualBackupButtonState({
    backupStatus,
    isLoading,
    isCreatingBackup
  });

  const actionDescription = getBackupHeaderDescription(runtimeStatus);

  const backupFolderDisplay = isLoading
    ? "Loading..."
    : backupStatus?.backupDestination || "Not available";

  const retentionDisplay = isLoading
    ? "Loading..."
    : backupStatus
      ? formatRetentionSummary(
          backupStatus.retainedWeeklyCount,
          backupStatus.retainedMonthlyCount
        )
      : "Not available";

  const retentionAriaLabel = isLoading
    ? "Loading retention information"
    : backupStatus
      ? `${backupStatus.retainedWeeklyCount ?? 0} recent weekly backups retained and ${
          backupStatus.retainedMonthlyCount ?? 0
        } monthly archives retained`
      : "Retention information not available";

  return (
    <Layout>
      <section className="mx-auto max-w-3xl">
        <div className="page-card">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-clinic-700">
              System Maintenance
            </p>

            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              Backup
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {actionDescription}
            </p>
          </div>

          {showWarning ? (
            <div className="feedback-message mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              {backupStatus?.lastBackupStatus === "failed"
                ? "The last backup failed. Please try creating another backup. If the problem continues, check that the backup folder is available."
                : "Automatic backup is overdue. Run a manual backup now if needed and keep the application running so the next automatic backup can complete."}
            </div>
          ) : null}

          <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
            <div className="max-w-xl">
              <h2 className="text-lg font-semibold text-slate-900">
                Create a Manual Backup
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Create an immediate backup of the database, uploads, and exports.
              </p>
            </div>

            <div
              className="mt-4 no-print"
              aria-busy={buttonState.isBusy ? "true" : "false"}
            >
              <button
                type="button"
                className="button-primary inline-flex items-center gap-2"
                onClick={handleBackup}
                disabled={buttonState.disabled}
                aria-disabled={buttonState.disabled ? "true" : "false"}
              >
                {buttonState.isBusy ? (
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    aria-hidden="true"
                  />
                ) : null}

                <span>{buttonState.label}</span>
              </button>

              {backupStatus?.backupInProgress && !isCreatingBackup ? (
                <p className="mt-2 text-sm text-slate-600">
                  Another backup is already in progress.
                </p>
              ) : null}

              {status ? (
            <p
              aria-live="polite"
              role="status"
              className={`feedback-message mt-5 rounded-xl px-4 py-3 text-sm ${
                statusTone === "success"
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
              }`}
            >
              {status}
            </p>
          ) : null}
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Backup Overview
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <OverviewItem
                label="Latest Backup"
                primary={isLoading ? "Loading..." : latestBackup.primary}
                secondary={isLoading ? "" : latestBackup.secondary}
              />

              <OverviewItem
                label="Next Backup"
                primary={
                  isLoading
                    ? "Loading..."
                    : getNextBackupDisplay(backupStatus, runtimeStatus)
                }
              />

              <OverviewItem
                label="Last Automatic"
                primary={
                  isLoading
                    ? "Loading..."
                    : formatBackupDateTime(
                        backupStatus?.lastAutomaticBackupAt,
                        "Not yet created"
                      )
                }
              />

              <OverviewItem
                label="Last Manual"
                primary={
                  isLoading
                    ? "Loading..."
                    : formatBackupDateTime(
                        backupStatus?.lastManualBackupAt,
                        "Not yet created"
                      )
                }
              />
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-5">
            <h2 className="text-lg font-semibold text-slate-900">
              Storage &amp; Retention
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Backup Folder
                </p>

                <p className="mt-2 break-all text-base font-semibold text-slate-900">
                  {backupFolderDisplay}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-500">
                  Retention
                </p>

                <p
                  className="mt-2 text-base font-semibold text-slate-900"
                  aria-label={retentionAriaLabel}
                >
                  {retentionDisplay}
                </p>

                <p className="mt-2 text-xs text-slate-500">
                  A monthly archive may also count as one retained weekly backup.
                </p>
              </div>
            </div>
          </section>

          
        </div>
      </section>
    </Layout>
  );
}
