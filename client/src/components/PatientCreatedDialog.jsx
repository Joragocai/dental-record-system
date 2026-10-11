import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function PatientCreatedDialog({ patient, preparing, error, onRegisterAnother, onViewPatient }) {
  const viewButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const viewActionRef = useRef(onViewPatient);
  viewActionRef.current = onViewPatient;
  const name = patient?.display_name || [patient?.first_name, patient?.last_name].filter(Boolean).join(" ") || "Patient";

  useEffect(() => {
    const previousFocus = document.activeElement;
    viewButtonRef.current?.focus();
    function handleKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        viewActionRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const buttons = Array.from(dialogRef.current.querySelectorAll("button:not(:disabled)"));
      if (!buttons.length) return;
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
  }, []);

  return createPortal(
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="patient-created-title" aria-describedby="patient-created-description"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m7 12 3.5 3.5L17 9"/></svg>
          </div>
          <div>
            <h2 id="patient-created-title" className="text-lg font-bold text-slate-900">Patient Created Successfully!</h2>
            <p id="patient-created-description" className="mt-1 text-sm text-slate-600">The patient record has been saved.</p>
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="break-words font-semibold text-slate-900">{name}</p>
          <p className="mt-1 text-sm text-slate-600">Patient ID: <span className="font-medium">{patient.patient_id}</span></p>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button type="button" disabled={preparing} onClick={onRegisterAnother}
            className="button-secondary min-h-11 flex-1 disabled:cursor-wait disabled:opacity-60">
            {preparing ? "Preparing..." : error ? "Retry Register Another" : "Register Another"}
          </button>
          <button ref={viewButtonRef} type="button" disabled={preparing} onClick={onViewPatient}
            className="button-primary min-h-11 flex-1 disabled:cursor-wait disabled:opacity-60">View Patient</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
