import { useEffect, useState } from "react";
import { deleteAttachment } from "../lib/api";
import { getAttachmentDownloadUrl, getUploadUrl } from "../lib/api";
import { formatAttachmentType, formatUploadedAt } from "../lib/attachments";

function isImage(mimeType) {
  return mimeType?.startsWith("image/");
}

export default function AttachmentGallery({ attachments, title, onDeleted }) {
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("success");
  const [deletingId, setDeletingId] = useState(null);
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

  async function handleDelete(attachment) {
    const confirmed = window.confirm("Are you sure you want to delete this attachment?");
    if (!confirmed) return;

    setDeletingId(attachment.id);
    setStatus("");

    try {
      await deleteAttachment(attachment.id);
    } catch (error) {
      setStatus(error.response?.data?.message || "Unable to delete attachment.");
      setStatusTone("error");
      setDeletingId(null);
      return;
    }

    try {
      await onDeleted?.();
      setStatus("Attachment deleted successfully.");
      setStatusTone("success");
    } catch {
      setStatus("Attachment deleted successfully, but the list could not refresh. Please reload the page.");
      setStatusTone("warning");
    } finally {
      setDeletingId(null);
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {attachments.map((attachment) => (
            <article key={attachment.id} className="attachment-gallery-card rounded-2xl border border-slate-200 p-3">
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
                <p className="text-xs text-slate-500">Filename: {attachment.original_filename}</p>
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
                    onClick={() => handleDelete(attachment)}
                    disabled={deletingId === attachment.id}
                  >
                    {deletingId === attachment.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
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
