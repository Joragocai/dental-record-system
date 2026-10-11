import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function ClearPatientFieldsDialog({ onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const cancelActionRef = useRef(onCancel);
  cancelActionRef.current = onCancel;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    cancelRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelActionRef.current();
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

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return createPortal(
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-patient-fields-title"
        aria-describedby="clear-patient-fields-description"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.3 4.1 2 18.4A1.6 1.6 0 0 0 3.4 21h17.2a1.6 1.6 0 0 0 1.4-2.6L13.7 4.1a1.9 1.9 0 0 0-3.4 0Z" />
              <path d="M12 9v5m0 3h.01" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 id="clear-patient-fields-title" className="text-lg font-bold text-slate-900">Clear entered fields?</h2>
            <p id="clear-patient-fields-description" className="mt-2 text-sm leading-relaxed text-slate-600">
              This will discard the information entered in this form. The Patient ID and Date Registered will be kept.
              No saved patient records will be deleted.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            className="button-secondary min-h-11 w-full sm:w-auto sm:min-w-28"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button-danger min-h-11 w-full sm:w-auto sm:min-w-32"
            onClick={onConfirm}
          >
            Clear Fields
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
