import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { formatAttachmentType } from "../lib/attachments";

export default function DeleteAttachmentDialog({ attachment, deleting, error, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const cancelCallback = useRef(onCancel);
  const deletingRef = useRef(deleting);
  cancelCallback.current = onCancel;
  deletingRef.current = deleting;

  useEffect(() => {
    const previousFocus = document.activeElement;
    cancelRef.current?.focus();
    function handleKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!deletingRef.current) cancelCallback.current();
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const buttons = Array.from(dialogRef.current.querySelectorAll("button:not(:disabled)"));
      if (!buttons.length) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault();
        buttons[buttons.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
        event.preventDefault();
        buttons[0].focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="delete-attachment-title" aria-describedby="delete-attachment-description" aria-busy={deleting}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start gap-3">
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-700">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6M10 10v7m4-7v7"/>
            </svg>
          </div>
          <div className="min-w-0">
            <h2 id="delete-attachment-title" className="text-lg font-bold text-slate-900">Delete Attachment?</h2>
            <p id="delete-attachment-description" className="mt-2 text-sm leading-relaxed text-slate-600">Are you sure you want to delete this attachment? This action cannot be undone.</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected Attachment</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{formatAttachmentType(attachment.attachment_type)}</p>
          <p className="mt-1 break-words text-xs text-slate-600 [overflow-wrap:anywhere]">{attachment.original_filename}</p>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" disabled={deleting} className="button-secondary min-h-11 disabled:opacity-60" onClick={onCancel}>Cancel</button>
          <button type="button" disabled={deleting} className="button-danger min-h-11 disabled:cursor-wait disabled:opacity-60" onClick={onConfirm}>{deleting ? "Deleting..." : error ? "Retry Delete" : "Delete Attachment"}</button>
        </div>
      </div>
    </div>, document.body
  );
}
