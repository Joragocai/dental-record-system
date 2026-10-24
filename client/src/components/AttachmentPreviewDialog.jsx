import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import AttachmentImage from "./AttachmentImage";
import { formatAttachmentType, formatUploadedAt } from "../lib/attachments";

// Keep the lightbox above animated page cards and the sticky navigation.
// A fixed overlay inside a transformed page card may not cover the viewport.
export default function AttachmentPreviewDialog({ attachment, onClose }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll(
        "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)"
      ));
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return createPortal(
    <div className="attachment-preview-overlay no-print" onClick={onClose}>
      <section
        ref={panelRef}
        className="attachment-preview-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className="attachment-preview-close min-h-11 min-w-11"
          aria-label="Close attachment preview"
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
        <AttachmentImage
          attachment={attachment}
          className="attachment-preview-image"
          alt={`Preview of ${attachment.original_filename || "attachment"}`}
        />
        <div className="mt-4 space-y-1">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            {formatAttachmentType(attachment.attachment_type)}
          </h2>
          <p className="text-sm text-slate-600">Uploaded: {formatUploadedAt(attachment.uploaded_at)}</p>
          <p className="break-words text-xs text-slate-500 [overflow-wrap:anywhere]">
            Filename: {attachment.original_filename}
          </p>
        </div>
      </section>
    </div>,
    document.body
  );
}
