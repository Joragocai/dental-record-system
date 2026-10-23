import { useEffect, useRef, useState } from "react";
import { clearDemoRecords, loadDemoRecords } from "../lib/api";
import { useRuntimeStatus } from "../context/RuntimeStatusContext";
import { useCloudAuth } from "../context/CloudAuthContext";

export default function DemoDataDock() {
  const { isDemoMode, loading, statusError, refreshRuntimeStatus } = useRuntimeStatus();
  const { enabled: cloudEnabled, authenticated } = useCloudAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dockRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(event) {
      if (!dockRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!isDemoMode) {
    if (!cloudEnabled || !authenticated) return null;
    return <aside className="no-print fixed bottom-24 right-0 z-40 rounded-l-lg border border-r-0 border-slate-200 bg-white p-2 text-xs shadow-sm sm:bottom-20" role="status">
      <p className="max-w-48 text-slate-600">{loading ? "Checking Demo Tools..." : statusError ? "Demo Tools unavailable" : "Demo Tools disabled"}</p>
      {statusError ? <p className="mt-1 max-w-48 break-words text-rose-700">{statusError}</p> : null}
      <button type="button" disabled={loading} onClick={refreshRuntimeStatus} className="mt-1 rounded border border-slate-200 px-2 py-1 text-clinic-800 hover:bg-slate-50 disabled:opacity-50">Retry</button>
    </aside>;
  }

  async function handleAction(action) {
    if (busy) return;
    const isReset = action === "reset";
    const confirmed = window.confirm(
      isReset
        ? "Reset the presentation to an empty clinic? This permanently clears all demo patients, treatments, appointments, attachments, exports, and demo backup history. Real clinic data will not be affected."
        : "Replace existing presentation records with fictional demo data? Any changes made to current demo records, attachments, exports, and demo backups will be lost."
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      if (isReset) await clearDemoRecords();
      else await loadDemoRecords();
      window.location.assign("/");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update presentation data. Please try again.");
      setBusy(false);
    }
  }

  return (
    <aside ref={dockRef} className="no-print fixed bottom-24 right-0 z-40 flex flex-col items-end sm:bottom-20" aria-label="Presentation tools">
      {open ? (
        <div id="presentation-tools-panel" className="mr-2 mb-2 w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-lg sm:mr-3" aria-busy={busy}>
          <p className="mb-2 px-1 text-xs font-medium text-slate-500">Demo Tools</p>
          <div className="flex flex-col gap-1.5">
            <button type="button" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50" onClick={() => handleAction("fill")} disabled={busy}>
              {busy ? "Working..." : "Demo Fill"}
            </button>
            <button type="button" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50" onClick={() => handleAction("reset")} disabled={busy}>Reset</button>
          </div>
          {error ? <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p> : null}
        </div>
      ) : null}
      <button
        type="button"
        aria-label={open ? "Close demo tools" : "Open demo tools"}
        aria-expanded={open}
        aria-controls="presentation-tools-panel"
        title="Demo tools"
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-8 items-center justify-center rounded-l-lg border border-r-0 border-slate-200 bg-slate-100/80 text-slate-400 shadow-sm transition-colors hover:bg-slate-200 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l-1.78 1.78a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.64H9.12A1.8 1.8 0 0 0 8 18.42a1.8 1.8 0 0 0-2 .36L4.24 17a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 3 13.88v-3.76A1.8 1.8 0 0 0 4.6 9a1.8 1.8 0 0 0-.36-2L6.02 5.2a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 9.12 3.9h5.76A1.8 1.8 0 0 0 16 5.56a1.8 1.8 0 0 0 2-.36L19.76 7a1.8 1.8 0 0 0-.36 2A1.8 1.8 0 0 0 21 10.12v3.76A1.8 1.8 0 0 0 19.4 15Z" />
        </svg>
      </button>
    </aside>
  );
}
