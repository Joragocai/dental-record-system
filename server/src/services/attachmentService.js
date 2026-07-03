import db from "../db/database.js";

export function createAttachment(attachment) {
  db.prepare(
    `INSERT INTO attachments (
      patient_id, treatment_id, attachment_type, original_filename, stored_filename,
      file_path, mime_type, file_size, uploaded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    attachment.patient_id,
    attachment.treatment_id ?? null,
    attachment.attachment_type,
    attachment.original_filename,
    attachment.stored_filename,
    attachment.file_path,
    attachment.mime_type,
    attachment.file_size,
    attachment.uploaded_at
  );
}

export function getAttachmentsByPatientId(patientId) {
  return db.prepare("SELECT * FROM attachments WHERE patient_id = ? ORDER BY uploaded_at DESC").all(patientId);
}

export function getAttachmentsByTreatmentId(treatmentId) {
  return db.prepare("SELECT * FROM attachments WHERE treatment_id = ? ORDER BY uploaded_at DESC").all(treatmentId);
}
