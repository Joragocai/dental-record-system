import { getUploadUrl } from "../lib/api";

function isImage(mimeType) {
  return mimeType?.startsWith("image/");
}

export default function AttachmentGallery({ attachments, title }) {
  return (
    <section className="page-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-title">{title}</h2>
        <span className="text-sm text-slate-500">{attachments.length} file(s)</span>
      </div>
      {!attachments.length && <p className="text-sm text-slate-500">No attachments uploaded.</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {attachments.map((attachment) => (
          <article key={attachment.id} className="rounded-2xl border border-slate-200 p-3">
            {isImage(attachment.mime_type) ? (
              <img
                src={getUploadUrl(attachment.file_path)}
                alt={attachment.original_filename}
                className="h-40 w-full rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-40 items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">
                File Preview Not Available
              </div>
            )}
            <div className="mt-3 space-y-1 text-sm">
              <p className="font-semibold text-slate-800">{attachment.original_filename}</p>
              <p className="text-slate-500">Type: {attachment.attachment_type}</p>
              <a
                href={getUploadUrl(attachment.file_path)}
                target="_blank"
                rel="noreferrer"
                className="text-clinic-700 underline"
              >
                Open / Download
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
