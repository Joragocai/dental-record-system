import express from "express";
import { createAttachment, getAttachmentsByTreatmentId } from "../services/attachmentService.js";
import { getPatientByPatientId } from "../services/patientService.js";
import { getNextTreatmentId } from "../services/idService.js";
import { createTreatment, getTreatmentByTreatmentId, listTreatments, updateTreatment } from "../services/treatmentService.js";
import { attachmentUpload, buildAttachmentPath, normalizeAttachmentType } from "../utils/attachmentUtils.js";
import { validateTreatmentPayload } from "../utils/validation.js";

const router = express.Router();

router.get("/", (_req, res) => {
  res.json(listTreatments());
});

router.get("/next-id", (_req, res) => {
  res.json({ treatment_id: getNextTreatmentId() });
});

router.get("/:treatmentId", (req, res) => {
  const treatment = getTreatmentByTreatmentId(req.params.treatmentId);
  if (!treatment) {
    res.status(404).json({ message: "Treatment not found." });
    return;
  }
  res.json(treatment);
});

router.get("/:treatmentId/attachments", (req, res) => {
  res.json(getAttachmentsByTreatmentId(req.params.treatmentId));
});

router.post("/:treatmentId/attachments", attachmentUpload.single("file"), (req, res) => {
  const treatment = getTreatmentByTreatmentId(req.params.treatmentId);
  if (!treatment) {
    res.status(404).json({ message: "Treatment not found." });
    return;
  }

  const patient = getPatientByPatientId(treatment.patient_id);
  if (!patient) {
    res.status(400).json({ message: "Valid patient selection is required." });
    return;
  }

  if (!req.file) {
    res.status(400).json({ message: "File upload is required." });
    return;
  }

  const attachmentTypeResult = normalizeAttachmentType(req.body.attachment_type);
  if (attachmentTypeResult.error) {
    res.status(400).json({ message: attachmentTypeResult.error });
    return;
  }

  const relativePath = buildAttachmentPath(req.file.filename, req.params.treatmentId);

  const attachment = createAttachment({
    patient_id: treatment.patient_id,
    treatment_id: req.params.treatmentId,
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

router.post("/", (req, res) => {
  const { errors, data } = validateTreatmentPayload(req.body);
  if (errors.length) {
    res.status(400).json({ message: errors[0], errors });
    return;
  }
  const patient = getPatientByPatientId(data.patient_id);
  if (!patient) {
    res.status(400).json({ message: "Valid patient selection is required." });
    return;
  }
  const now = new Date().toISOString();
  const record = createTreatment(data, now);
  res.status(201).json(record);
});

router.put("/:treatmentId", (req, res) => {
  const existing = getTreatmentByTreatmentId(req.params.treatmentId);
  if (!existing) {
    res.status(404).json({ message: "Treatment not found." });
    return;
  }
  const { errors, data } = validateTreatmentPayload({ ...req.body, treatment_id: req.params.treatmentId });
  if (errors.length) {
    res.status(400).json({ message: errors[0], errors });
    return;
  }
  const patient = getPatientByPatientId(data.patient_id);
  if (!patient) {
    res.status(400).json({ message: "Valid patient selection is required." });
    return;
  }
  const record = updateTreatment(req.params.treatmentId, data, new Date().toISOString());
  res.json(record);
});

export default router;
