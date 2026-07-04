import fs from "node:fs";
import express from "express";
import { createAttachment, deleteAttachmentById, getAttachmentById, getAttachmentsByTreatmentId } from "../services/attachmentService.js";
import { getPatientByPatientId } from "../services/patientService.js";
import { getTreatmentByTreatmentId } from "../services/treatmentService.js";
import {
  attachmentUpload,
  buildAttachmentPath,
  deleteAttachmentFileIfPresent,
  normalizeAttachmentType,
  resolveAttachmentAbsolutePath
} from "../utils/attachmentUtils.js";
const router = express.Router();

router.post("/", attachmentUpload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "File upload is required." });
    return;
  }

  if (!req.body.patient_id || !getPatientByPatientId(req.body.patient_id)) {
    res.status(400).json({ message: "A valid patient ID is required." });
    return;
  }

  if (req.body.treatment_id && !getTreatmentByTreatmentId(req.body.treatment_id)) {
    res.status(400).json({ message: "Treatment ID is not valid." });
    return;
  }

  const attachmentTypeResult = normalizeAttachmentType(req.body.attachment_type);
  if (attachmentTypeResult.error) {
    res.status(400).json({ message: attachmentTypeResult.error });
    return;
  }

  const relativePath = buildAttachmentPath(req.file.filename, req.body.treatment_id);

  const attachment = createAttachment({
    patient_id: req.body.patient_id,
    treatment_id: req.body.treatment_id || null,
    attachment_type: attachmentTypeResult.value,
    original_filename: req.file.originalname,
    stored_filename: req.file.filename,
    file_path: relativePath,
    mime_type: req.file.mimetype,
    file_size: req.file.size,
    uploaded_at: new Date().toISOString()
  });

  res.status(201).json({ message: "Attachment uploaded.", attachment, file_path: relativePath });
});

router.get("/treatments/:treatmentId", (req, res) => {
  res.json(getAttachmentsByTreatmentId(req.params.treatmentId));
});

router.get("/:id/download", (req, res) => {
  const attachment = getAttachmentById(req.params.id);
  if (!attachment) {
    res.status(404).json({ message: "Attachment not found." });
    return;
  }

  const absolutePath = resolveAttachmentAbsolutePath(attachment.file_path);
  if (!absolutePath) {
    res.status(400).json({ message: "Attachment file path is not valid." });
    return;
  }

  if (!fs.existsSync(absolutePath)) {
    res.status(404).json({ message: "Attachment file is missing." });
    return;
  }

  res.download(absolutePath, attachment.original_filename);
});

router.delete("/:id", async (req, res, next) => {
  const attachment = getAttachmentById(req.params.id);
  if (!attachment) {
    res.status(404).json({ message: "Attachment not found." });
    return;
  }

  try {
    await deleteAttachmentFileIfPresent(attachment.file_path);
    deleteAttachmentById(req.params.id);
    res.json({ message: "Attachment deleted successfully." });
  } catch (error) {
    next(error);
  }
});

export default router;
