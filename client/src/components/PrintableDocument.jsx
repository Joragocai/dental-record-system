import { getUploadUrl } from "../lib/api";
import { buildPrintableAttachmentViewModel } from "../lib/printDocument";

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
        {attachments.map((attachment) => {
          const viewModel = buildPrintableAttachmentViewModel(attachment);

          return (
            <div key={attachment.id} className="attachment-sheet-item">
              {viewModel.isImage ? (
                <img src={getUploadUrl(attachment.file_path)} alt={viewModel.alt} className="attachment-sheet-image" />
              ) : (
                <div className="attachment-sheet-placeholder">{viewModel.placeholderText}</div>
              )}
              <p className="mt-2 text-sm font-semibold text-slate-900">{viewModel.label}</p>
            </div>
          );
        })}
      </div>
    </PrintSection>
  );
}
