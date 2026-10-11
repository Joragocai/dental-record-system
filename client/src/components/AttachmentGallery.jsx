import { useEffect, useRef, useState } from "react";
import { deleteAttachment } from "../lib/api";
import { getAttachmentDownloadUrl, getUploadUrl } from "../lib/api";
import { formatAttachmentType, formatUploadedAt } from "../lib/attachments";
import DeleteAttachmentDialog from "./DeleteAttachmentDialog";

function isImage(mimeType) {
  return mimeType?.startsWith("image/");
}

export default function AttachmentGallery({ attachments, title, onDeleted }) {
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("success");
  const [deletingId, setDeletingId] = useState(null);
  const [attachmentToDelete, setAttachmentToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const deleteInFlightRef = useRef(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);

  useEffect(() => {
    if (!status) return undefined;

    const timeoutId = window.setTimeout(() => {
      setStatus("");
      setStatusTone("success");
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [status]);

  useEffect(() => {
    if (!previewAttachment) return undefined;

    function handleEscape(event) {
      if (event.key === "Escape") {
        setPreviewAttachment(null);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [previewAttachment]);

  function requestDelete(attachment) {
    if (deleteInFlightRef.current || attachmentToDelete) return;
    setDeleteError("");
    setAttachmentToDelete(attachment);
  }

  function cancelDelete() {
    if (deleteInFlightRef.current) return;
    setAttachmentToDelete(null);
    setDeleteError("");
  }

  async function confirmDelete() {
    if (!attachmentToDelete || deleteInFlightRef.current) return;
    const attachmentId = attachmentToDelete.id;
    deleteInFlightRef.current = true;
    setDeletingId(attachmentId);
    setDeleteError("");
    setStatus("");

    try {
      await deleteAttachment(attachmentId);
    } catch (error) {
      setDeleteError(error.response?.data?.message || "Unable to delete attachment. Please retry or cancel.");
      setDeletingId(null);
      deleteInFlightRef.current = false;
      return;
    }

    setAttachmentToDelete(null);
    try {
      await onDeleted?.();
      setStatus("Attachment deleted successfully.");
      setStatusTone("success");
    } catch {
      setStatus("Attachment deleted successfully, but the list could not refresh. Please reload the page.");
      setStatusTone("warning");
    } finally {
      setDeletingId(null);
      deleteInFlightRef.current = false;
    }
  }

  return (
    <section className="page-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-title">{title}</h2>
        <span className="text-sm text-slate-500">{attachments.length} file(s)</span>
      </div>
      {status && (
        <div
          className={`feedback-message mb-4 rounded-xl px-4 py-3 text-sm ${
            statusTone === "success"
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : statusTone === "warning"
                ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
          }`}
        >
          {status}
        </div>
      )}
      {!attachments.length && <p className="text-sm text-slate-500">No attachments uploaded.</p>}
      <div className="max-h-[420px] overflow-y-auto pr-1">
        <div className="attachment-gallery-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {attachments.map((attachment) => (
            <article key={attachment.id} className="attachment-gallery-card min-w-0 rounded-2xl border border-slate-200 p-3">
              {isImage(attachment.mime_type) ? (
                <button type="button" className="attachment-preview-trigger block w-full" onClick={() => setPreviewAttachment(attachment)}>
                  <img
                    src={getUploadUrl(attachment.file_path)}
                    alt={attachment.original_filename}
                    className="h-40 w-full rounded-xl object-cover transition hover:opacity-95"
                  />
                </button>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">
                  File Preview Not Available
                </div>
              )}
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-base font-semibold text-slate-900">{formatAttachmentType(attachment.attachment_type)}</p>
                <p className="text-sm font-medium text-slate-700">Uploaded: {formatUploadedAt(attachment.uploaded_at)}</p>
                <p className="break-words text-xs text-slate-500 [overflow-wrap:anywhere]">Filename: {attachment.original_filename}</p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <a
                    href={getAttachmentDownloadUrl(attachment.id)}
                    className="button-download"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    className="button-danger-outline"
                    onClick={() => requestDelete(attachment)}
                    disabled={deletingId !== null || attachmentToDelete !== null}
                  >
                    {deletingId === attachment.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      {attachmentToDelete ? (
        <DeleteAttachmentDialog attachment={attachmentToDelete} deleting={deletingId !== null} error={deleteError} onCancel={cancelDelete} onConfirm={confirmDelete} />
      ) : null}
      {previewAttachment && (
        <div className="attachment-preview-overlay" onClick={() => setPreviewAttachment(null)}>
          <div className="attachment-preview-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="attachment-preview-close" onClick={() => setPreviewAttachment(null)}>
              ×
            </button>
            <img
              src={getUploadUrl(previewAttachment.file_path)}
              alt={previewAttachment.original_filename}
              className="attachment-preview-image"
            />
            <div className="mt-4 space-y-1">
              <p className="text-lg font-semibold text-slate-900">{formatAttachmentType(previewAttachment.attachment_type)}</p>
              <p className="text-sm text-slate-600">Uploaded: {formatUploadedAt(previewAttachment.uploaded_at)}</p>
              <p className="text-xs text-slate-500">Filename: {previewAttachment.original_filename}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
