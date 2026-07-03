import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { createAttachment, getAttachmentsByTreatmentId } from "../services/attachmentService.js";
import { getPatientByPatientId } from "../services/patientService.js";
import { getTreatmentByTreatmentId } from "../services/treatmentService.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../../..");
const patientUploadDir = path.join(rootDir, "uploads", "patients");
const treatmentUploadDir = path.join(rootDir, "uploads", "treatments");
fs.mkdirSync(patientUploadDir, { recursive: true });
fs.mkdirSync(treatmentUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination(req, _file, callback) {
    callback(null, req.body.treatment_id ? treatmentUploadDir : patientUploadDir);
  },
  filename(_req, file, callback) {
    const extension = path.extname(file.originalname);
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  }
});

const upload = multer({ storage });
const router = express.Router();

router.post("/", upload.single("file"), (req, res) => {
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

  const relativePath = req.body.treatment_id
    ? `/uploads/treatments/${req.file.filename}`
    : `/uploads/patients/${req.file.filename}`;

  createAttachment({
    patient_id: req.body.patient_id,
    treatment_id: req.body.treatment_id || null,
    attachment_type: req.body.attachment_type || "other",
    original_filename: req.file.originalname,
    stored_filename: req.file.filename,
    file_path: relativePath,
    mime_type: req.file.mimetype,
    file_size: req.file.size,
    uploaded_at: new Date().toISOString()
  });

  res.status(201).json({ message: "Attachment uploaded.", file_path: relativePath });
});

router.get("/treatments/:treatmentId", (req, res) => {
  res.json(getAttachmentsByTreatmentId(req.params.treatmentId));
});

export default router;
