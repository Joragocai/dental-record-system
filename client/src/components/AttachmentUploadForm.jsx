import { useState } from "react";
import { uploadAttachment } from "../lib/api";

const attachmentTypes = ["profile_photo", "pre_op_photo", "post_op_photo", "xray", "other"];

export default function AttachmentUploadForm({ patientId, treatmentId, onUploaded }) {
  const [attachmentType, setAttachmentType] = useState("other");
  const [status, setStatus] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const file = event.currentTarget.file.files?.[0];
    if (!patientId || !file) {
      setStatus("Select a file before uploading.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("patient_id", patientId);
      formData.append("attachment_type", attachmentType);
      if (treatmentId) formData.append("treatment_id", treatmentId);
      formData.append("file", file);
      await uploadAttachment(formData);
      event.currentTarget.reset();
      setStatus("Attachment uploaded.");
      onUploaded?.();
    } catch (error) {
      setStatus(error.response?.data?.message || "Unable to upload attachment.");
    }
  }

  return (
    <section className="page-card no-print">
      <h2 className="section-title">Upload Attachment</h2>
      <form className="mt-4 grid gap-4 md:grid-cols-3" onSubmit={handleSubmit}>
        <label>
          <span className="label-text">Attachment Type</span>
          <select className="select-input" value={attachmentType} onChange={(event) => setAttachmentType(event.target.value)}>
            {attachmentTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="md:col-span-2">
          <span className="label-text">File</span>
          <input name="file" className="text-input" type="file" />
        </label>
        <div className="md:col-span-3 flex flex-wrap items-center gap-3">
          <button type="submit" className="button-primary">
            Upload File
          </button>
          {status && <p className="text-sm text-slate-600">{status}</p>}
        </div>
      </form>
    </section>
  );
}
