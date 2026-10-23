import { formatAttachmentType } from "../lib/attachments";
import AttachmentImage from "./AttachmentImage";

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

  function getPrintableAttachmentLabel(attachmentType) {
    return attachmentType && String(attachmentType).trim() ? formatAttachmentType(attachmentType) : "Attachment";
  }

  return (
    <PrintSection title={title}>
      <div className="attachment-sheet-grid">
        {attachments.map((attachment) => (
          <div key={attachment.id} className="attachment-sheet-item">
            {attachment.mime_type?.startsWith("image/") ? (
              <AttachmentImage attachment={attachment} className="attachment-sheet-image" />
            ) : (
              <div className="attachment-sheet-placeholder">File Preview Not Available</div>
            )}
            <p className="mt-2 text-sm font-semibold text-slate-900">{getPrintableAttachmentLabel(attachment.attachment_type)}</p>
          </div>
        ))}
      </div>
    </PrintSection>
  );
}
