import { useEffect, useState } from "react";
import { getPrivateAttachmentPreview, getUploadUrl } from "../lib/api";
import { cloudAuthEnabled } from "../lib/cloudAuth";

// The cloud browser receives a short-lived, in-memory blob URL only after
// the protected API authorizes each request. No public Storage URL is used.
export default function AttachmentImage({ attachment, className = "", alt }) {
  const [source, setSource] = useState(cloudAuthEnabled ? "" : getUploadUrl(attachment.file_path));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!cloudAuthEnabled) {
      setSource(getUploadUrl(attachment.file_path));
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    let objectUrl = "";
    setSource("");
    setError(false);

    getPrivateAttachmentPreview(attachment.id, { signal: controller.signal })
      .then((blob) => {
        if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
          throw new Error("Unsupported image preview response.");
        }
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.file_path]);

  if (!source) {
    return (
      <div className={`${className} flex items-center justify-center bg-slate-100 text-xs text-slate-500`}
        role="status">
        {error ? "Image preview unavailable" : "Loading private image…"}
      </div>
    );
  }
  return <img className={className} src={source} alt={alt || attachment.original_filename || "Attachment"} />;
}
