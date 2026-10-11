import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getExportUrl } from "../lib/api";

// Keep clinical actions prominent; print/export remain one click away.
export default function PatientRecordActions({ patientId }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const actionsRef = useRef(null);
  const moreTriggerRef = useRef(null);

  useEffect(() => {
    setMoreOpen(false);
  }, [patientId]);

  useEffect(() => {
    if (!moreOpen) return;

    function dismissOutside(event) {
      if (!actionsRef.current?.contains(event.target)) setMoreOpen(false);
    }

    function dismissOnEscape(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMoreOpen(false);
      moreTriggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [moreOpen]);

  function dismissOnBlur(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) setMoreOpen(false);
  }

  return (
    <div className="no-print mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
      <Link
        to={`/treatments/new?patientId=${patientId}`}
        className="button-primary inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 sm:w-auto"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="5" width="14" height="16" rx="2" />
          <path d="M9 5.5V3h6v2.5M12 10v7M8.5 13.5h7" />
        </svg>
        Record Treatment
      </Link>
      <Link
        to={`/patients/${patientId}/edit`}
        className="button-secondary inline-flex min-h-11 flex-1 items-center justify-center gap-2 px-4 sm:flex-none"
      >
        Edit Patient
      </Link>
      <div ref={actionsRef} className="relative min-w-0 flex-1 sm:flex-none" onBlur={dismissOnBlur}>
        <button
          ref={moreTriggerRef}
          type="button"
          aria-label="More patient record actions"
          aria-expanded={moreOpen}
          aria-controls={moreOpen ? "patient-record-more-actions" : undefined}
          onClick={() => setMoreOpen((current) => !current)}
          className="button-secondary inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 sm:w-auto"
        >
          More
          <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {moreOpen ? (
          <div
            id="patient-record-more-actions"
            role="group"
            aria-label="Patient record documents"
            className="absolute right-0 top-full z-30 mt-2 w-56 max-w-[calc(100vw-2.5rem)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
          >
            <Link
              to={`/print/patients/${patientId}`}
              onClick={() => setMoreOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-clinic-50 hover:text-clinic-900 focus-visible:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700"
            >
              Print Patient Record
            </Link>
            <a
              href={getExportUrl(`/api/export/patients/${patientId}/full-record`)}
              onClick={() => setMoreOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-clinic-50 hover:text-clinic-900 focus-visible:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700"
            >
              Export Full Record
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
