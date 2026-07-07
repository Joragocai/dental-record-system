import express from "express";
import { getNextPatientId } from "../services/idService.js";
import { createPatient, getPatientByPatientId, listPatients, searchPatients, updatePatient } from "../services/patientService.js";
import { createAppointment, listAppointmentsByPatientId } from "../services/appointmentService.js";
import { getTreatmentsByPatientId } from "../services/treatmentService.js";
import { getAttachmentsByPatientId } from "../services/attachmentService.js";
import { toIsoDateString } from "../utils/dateUtils.js";
import { validateAppointmentPayload, validatePatientPayload } from "../utils/validation.js";

const router = express.Router();

router.get("/", (_req, res) => {
  res.json(listPatients());
});

router.get("/next-id", (_req, res) => {
  res.json({ patient_id: getNextPatientId(), date_registered: toIsoDateString() });
});

router.get("/search", (req, res) => {
  const query = req.query.q?.toString() || "";
  if (!query.trim()) {
    res.json(listPatients());
    return;
  }
  res.json(searchPatients(query));
});

router.get("/:patientId", (req, res) => {
  const patient = getPatientByPatientId(req.params.patientId);
  if (!patient) {
    res.status(404).json({ message: "Patient not found." });
    return;
  }
  res.json(patient);
});

router.post("/", (req, res) => {
  const { errors, data } = validatePatientPayload(req.body);
  if (errors.length) {
    res.status(400).json({ message: errors[0], errors });
    return;
  }
  const now = new Date().toISOString();
  const record = createPatient(data, now);
  res.status(201).json(record);
});

router.put("/:patientId", (req, res) => {
  const existing = getPatientByPatientId(req.params.patientId);
  if (!existing) {
    res.status(404).json({ message: "Patient not found." });
    return;
  }
  const { errors, data } = validatePatientPayload({ ...req.body, patient_id: req.params.patientId });
  if (errors.length) {
    res.status(400).json({ message: errors[0], errors });
    return;
  }
  const record = updatePatient(req.params.patientId, data, new Date().toISOString());
  res.json(record);
});

router.get("/:patientId/treatments", (req, res) => {
  res.json(getTreatmentsByPatientId(req.params.patientId));
});

router.get("/:patientId/attachments", (req, res) => {
  res.json(getAttachmentsByPatientId(req.params.patientId));
});

router.get("/:patientId/appointments", (req, res) => {
  const patient = getPatientByPatientId(req.params.patientId);
  if (!patient) {
    res.status(404).json({ message: "Patient not found." });
    return;
  }
  res.json(listAppointmentsByPatientId(req.params.patientId));
});

router.post("/:patientId/appointments", (req, res) => {
  const patient = getPatientByPatientId(req.params.patientId);
  if (!patient) {
    res.status(404).json({ message: "Patient not found." });
    return;
  }

  const { errors, data } = validateAppointmentPayload({ ...req.body, patient_id: req.params.patientId });
  if (errors.length) {
    res.status(400).json({ message: errors[0], errors });
    return;
  }

  const now = new Date().toISOString();
  const record = createAppointment(data, now);
  res.status(201).json(record);
});

export default router;
