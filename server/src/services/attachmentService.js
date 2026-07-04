import db from "../db/database.js";

export function createAttachment(attachment) {
  const result = db.prepare(
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

  return getAttachmentById(result.lastInsertRowid);
}

export function getAttachmentsByPatientId(patientId) {
  return db.prepare("SELECT * FROM attachments WHERE patient_id = ? AND treatment_id IS NULL ORDER BY uploaded_at DESC").all(patientId);
}

export function getAttachmentsByTreatmentId(treatmentId) {
  return db.prepare("SELECT * FROM attachments WHERE treatment_id = ? ORDER BY uploaded_at DESC").all(treatmentId);
}

export function getAttachmentById(id) {
  return db.prepare("SELECT * FROM attachments WHERE id = ?").get(id);
}

export function deleteAttachmentById(id) {
  return db.prepare("DELETE FROM attachments WHERE id = ?").run(id);
}

export function listPatientAttachments() {
  return db.prepare("SELECT * FROM attachments WHERE treatment_id IS NULL ORDER BY uploaded_at DESC").all();
}

export function listTreatmentAttachments() {
  return db.prepare("SELECT * FROM attachments WHERE treatment_id IS NOT NULL ORDER BY uploaded_at DESC").all();
}

export function getAllAttachmentsByPatientId(patientId) {
  return db.prepare("SELECT * FROM attachments WHERE patient_id = ? ORDER BY uploaded_at DESC").all(patientId);
}
