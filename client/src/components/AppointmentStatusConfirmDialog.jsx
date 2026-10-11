import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function AppointmentStatusConfirmDialog({ change, saving, error, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const cancelRefCallback = useRef(onCancel);
  cancelRefCallback.current = onCancel;

  useEffect(() => {
    const previousFocus = document.activeElement;
    cancelRef.current?.focus();
    function handleKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!saving) cancelRefCallback.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const buttons = Array.from(dialogRef.current.querySelectorAll("button:not(:disabled)"));
      if (!buttons.length) {
        event.preventDefault();
        return;
      }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [saving]);

  return createPortal(
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="appointment-change-title" aria-describedby="appointment-change-description"
        aria-busy={saving} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start gap-3">
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v5m0 4h.01"/><circle cx="12" cy="12" r="10"/>
            </svg>
          </div>
          <div>
            <h2 id="appointment-change-title" className="text-lg font-bold text-slate-900">Confirm appointment status change?</h2>
            <p id="appointment-change-description" className="mt-2 text-sm leading-relaxed text-slate-600">
              Changing this appointment may also affect the schedule and counts shown on the dashboard.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="text-slate-600">Current status: <strong className="text-slate-900">{change.currentStatus}</strong></p>
          <p className="mt-1 text-slate-600">New status: <strong className="text-clinic-900">{change.nextStatus}</strong></p>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" disabled={saving} className="button-secondary min-h-11 disabled:opacity-60" onClick={onCancel}>Cancel</button>
          <button type="button" disabled={saving} className="button-primary min-h-11 disabled:cursor-wait disabled:opacity-60" onClick={onConfirm}>
            {saving ? "Updating..." : error ? "Retry Change" : "Confirm Change"}
          </button>
        </div>
      </div>
    </div>, document.body
  );
}
