import { formatAttachmentType, formatUploadedAt } from "../lib/attachments";
import { getUploadUrl } from "../lib/api";

export function PrintField({ label, value }) {
  return (
    <div className="document-field">
      <span className="document-field-label">{label}</span>
      <span className="document-field-value">{value || "-"}</span>
    </div>
  );
}

export function PrintSection({ title, children }) {
  return (
    <section className="document-section">
      <h2 className="document-section-title">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function PrintableAttachments({ attachments, title = "Uploaded Images and Files", showUploadedAt = false }) {
  if (!attachments.length) return null;

  return (
    <PrintSection title={title}>
      <div className="attachment-sheet-grid">
        {attachments.map((attachment) => (
          <div key={attachment.id} className="attachment-sheet-item">
            {attachment.mime_type?.startsWith("image/") ? (
              <img src={getUploadUrl(attachment.file_path)} alt={attachment.original_filename} className="attachment-sheet-image" />
            ) : (
              <div className="attachment-sheet-placeholder">File Preview Not Available</div>
            )}
            <p className="mt-2 text-sm font-semibold text-slate-900">{formatAttachmentType(attachment.attachment_type)}</p>
            {showUploadedAt ? <p className="text-xs text-slate-600">Uploaded: {formatUploadedAt(attachment.uploaded_at)}</p> : null}
            <p className="text-xs text-slate-600">{attachment.original_filename}</p>
          </div>
        ))}
      </div>
      {showUploadedAt ? (
        <div className="mt-3 space-y-1.5 text-sm">
          {attachments.map((attachment) => (
            <div key={`list-${attachment.id}`} className="document-attachment-line">
              <strong>Attachment Category:</strong> {formatAttachmentType(attachment.attachment_type)} | {attachment.original_filename} | Uploaded{" "}
              {formatUploadedAt(attachment.uploaded_at)}
            </div>
          ))}
        </div>
      ) : null}
    </PrintSection>
  );
}
