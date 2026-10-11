import { useEffect } from "react";

// Non-blocking save feedback shared by appointments and treatments.
export default function RecordSuccessToast({ notice, onDismiss, dismissLabel = "Dismiss notification" }) {
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timeout);
  }, [notice, onDismiss]);

  if (!notice) return null;
  return (
    <div
      className="no-print fixed right-4 top-20 z-40 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-emerald-200 bg-white p-4 shadow-xl sm:right-6"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">✓</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{notice.title}</p>
          <p className="mt-1 text-sm text-slate-600">{notice.message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clinic-700"
        >
          ×
        </button>
      </div>
    </div>
  );
}
