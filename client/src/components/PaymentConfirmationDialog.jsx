import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

// Render above the app shell. Animated .page-card ancestors create a containing
// block for fixed descendants, so keeping modals inside a card breaks the overlay.
export default function PaymentConfirmationDialog({
  title,
  children,
  onCancel,
  onConfirm,
  confirmLabel,
  busyLabel = "Saving...",
  busy = false,
  confirmDisabled = false,
  destructive = false,
  error = ""
}) {
  const headingId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const closeCallback = useRef(onCancel);
  const busyRef = useRef(busy);
  closeCallback.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    function handleKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) closeCallback.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll(
          "button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]"
        )
      );
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <div className="no-print fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-busy={busy}
        className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
      >
        <h2 id={headingId} className="text-xl font-bold text-slate-900">{title}</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-700">{children}</div>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            className="button-secondary min-h-11"
            onClick={onCancel}
            disabled={busy}
          >Cancel</button>
          <button
            type="button"
            className={destructive
              ? "min-h-11 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              : "button-primary min-h-11 disabled:opacity-50"}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >{busy ? busyLabel : confirmLabel}</button>
        </div>
      </section>
    </div>,
    document.body
  );
}
