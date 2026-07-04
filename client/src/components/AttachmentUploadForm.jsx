import { useEffect, useMemo, useRef, useState } from "react";
import { uploadAttachment, uploadTreatmentAttachment } from "../lib/api";
import { suggestedAttachmentTypes } from "../lib/attachments";

export default function AttachmentUploadForm({
  patientId,
  treatmentId,
  onUploaded,
  title = "Upload Attachment",
  uploadButtonLabel = "Upload Attachment",
  treatmentOnly = false
}) {
  const [attachmentType, setAttachmentType] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("info");
  const [fieldError, setFieldError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const fileInputRef = useRef(null);

  const datalistId = useMemo(
    () => `attachment-types-${treatmentId || patientId || "general"}`.replace(/[^a-zA-Z0-9-_]/g, "-"),
    [patientId, treatmentId]
  );

  const uploadDisabled = treatmentOnly && !treatmentId;

  useEffect(() => {
    if (statusTone !== "success" || !status) return undefined;

    const timeoutId = window.setTimeout(() => {
      setStatus("");
      setStatusTone("info");
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [status, statusTone]);

  function clearSelectedFile() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setSelectedFileName("");
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    const trimmedAttachmentType = attachmentType.trim();

    if (uploadDisabled) {
      setFieldError("");
      setUploadError("Save the treatment first before uploading treatment attachments.");
      setStatus("");
      setStatusTone("info");
      return;
    }

    if (!patientId || !file) {
      setFieldError("");
      setUploadError("Select a file before uploading.");
      setStatus("");
      setStatusTone("info");
      return;
    }

    if (!trimmedAttachmentType) {
      setFieldError("Attachment Category is required.");
      setUploadError("");
      setStatus("");
      setStatusTone("info");
      return;
    }

    if (trimmedAttachmentType.length > 100) {
      setFieldError("Attachment Category must not be longer than 100 characters.");
      setUploadError("");
      setStatus("");
      setStatusTone("info");
      return;
    }

    setFieldError("");
    setUploadError("");
    setStatus("");
    setStatusTone("info");

    const formData = new FormData();
    formData.append("patient_id", patientId);
    formData.append("attachment_type", trimmedAttachmentType);
    formData.append("file", file);

    try {
      if (treatmentOnly) {
        await uploadTreatmentAttachment(treatmentId, formData);
      } else {
        if (treatmentId) formData.append("treatment_id", treatmentId);
        await uploadAttachment(formData);
      }
    } catch (uploadError) {
      setUploadError(uploadError.response?.data?.message || "Unable to upload attachment.");
      setStatus("");
      setStatusTone("info");
      return;
    }

    clearSelectedFile();
    setAttachmentType("");
    setFieldError("");
    setUploadError("");

    try {
      await onUploaded?.();
      setStatus("Attachment uploaded successfully.");
      setStatusTone("success");
    } catch {
      setStatus("Attachment uploaded, but the list could not refresh. Please reload the page.");
      setStatusTone("warning");
    }
  }

  return (
    <section className="page-card no-print">
      <h2 className="section-title">{title}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label>
          <span className="label-text">Attachment Category</span>
          <input
            className={`text-input ${fieldError ? "input-error" : ""}`}
            list={datalistId}
            value={attachmentType}
            onChange={(event) => {
              setAttachmentType(event.target.value);
              if (fieldError) setFieldError("");
            }}
            placeholder="Choose or type attachment category"
            disabled={uploadDisabled}
          />
          <p className="mt-1 text-xs text-slate-500">
            Choose or type the clinical category of this upload, such as Pre-op Photo, Post-op Photo, X-ray, or Consent Form.
          </p>
          {fieldError && <p className="error-text">{fieldError}</p>}
          <datalist id={datalistId}>
            {suggestedAttachmentTypes.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </label>
        <div className="md:col-span-2">
          <span className="label-text">File</span>
          <div className="file-picker-wrap">
            <input
              ref={fileInputRef}
              name="file"
              id={datalistId + "-file"}
              className="sr-only"
              type="file"
              disabled={uploadDisabled}
              onChange={(event) => {
                setUploadError("");
                setSelectedFileName(event.target.files?.[0]?.name || "");
              }}
            />
            <label htmlFor={datalistId + "-file"} className={`file-picker-button ${uploadDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
              Choose File
            </label>
            <div className="file-picker-name" aria-live="polite">
              {selectedFileName || "No file selected"}
            </div>
            {selectedFileName && !uploadDisabled && (
              <button
                type="button"
                className="file-picker-remove"
                onClick={() => {
                  setUploadError("");
                  clearSelectedFile();
                }}
              >
                Remove file
              </button>
            )}
          </div>
        </div>
        <div className="md:col-span-3 flex flex-wrap items-center gap-3">
          <button type="button" className="button-primary" disabled={uploadDisabled} onClick={handleUpload}>
            {uploadButtonLabel}
          </button>
          {uploadDisabled && <p className="text-sm text-amber-700">Save the treatment first before uploading treatment attachments.</p>}
          {uploadError && <p className="text-sm text-rose-600">{uploadError}</p>}
        </div>
        {status && (
          <div
            className={`md:col-span-3 rounded-xl px-4 py-3 text-sm ${
              statusTone === "success"
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
            }`}
          >
            {status}
          </div>
        )}
      </div>
    </section>
  );
}
