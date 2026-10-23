import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ProtectedExportLink from "./ProtectedExportLink";

// Group supporting document actions while keeping the clinical edit action prominent.
export default function TreatmentRecordActions({ treatmentId, patientId, originState }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const actionsRef = useRef(null);
  const moreTriggerRef = useRef(null);

  useEffect(() => setMoreOpen(false), [treatmentId, patientId]);

  useEffect(() => {
    if (!moreOpen) return undefined;

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
        to={`/treatments/${treatmentId}/edit`}
        state={originState}
        className="button-primary inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 sm:w-auto"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
          <path d="m15 5 4 4M11 13l-1 4 4-1 7-7a2.8 2.8 0 0 0-4-4z" />
        </svg>
        Edit Treatment
      </Link>
      <div ref={actionsRef} className="relative min-w-0 flex-1 sm:flex-none" onBlur={dismissOnBlur}>
        <button
          ref={moreTriggerRef}
          type="button"
          aria-label="More treatment record actions"
          aria-expanded={moreOpen}
          aria-controls={moreOpen ? "treatment-record-more-actions" : undefined}
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
            id="treatment-record-more-actions"
            role="group"
            aria-label="Treatment record documents"
            className="absolute right-0 top-full z-30 mt-2 w-60 max-w-[calc(100vw-2.5rem)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
          >
            <Link
              to={`/print/treatments/${treatmentId}`}
              onClick={() => setMoreOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-clinic-50 hover:text-clinic-900 focus-visible:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700"
            >
              Print Treatment Record
            </Link>
            {patientId ? (
              <ProtectedExportLink
                path={`/api/export/patients/${patientId}/treatments`}
                onClick={() => setMoreOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-clinic-50 hover:text-clinic-900 focus-visible:bg-clinic-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700"
              >
                Export Patient Treatments
              </ProtectedExportLink>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
