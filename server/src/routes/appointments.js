import express from "express";
import { getPatientByPatientId } from "../services/patientService.js";
import { getAppointmentById, updateAppointment, updateAppointmentStatus } from "../services/appointmentService.js";
import { validateAppointmentPayload } from "../utils/validation.js";

const router = express.Router();

router.get("/:appointmentId", (req, res) => {
  const appointment = getAppointmentById(req.params.appointmentId);
  if (!appointment) {
    res.status(404).json({ message: "Appointment not found." });
    return;
  }

  res.json(appointment);
});

router.patch("/:appointmentId", (req, res) => {
  const existing = getAppointmentById(req.params.appointmentId);
  if (!existing) {
    res.status(404).json({ message: "Appointment not found." });
    return;
  }

  const payload = {
    patient_id: existing.patient_id,
    appointment_date: req.body.appointment_date ?? existing.appointment_date,
    appointment_time: req.body.appointment_time ?? existing.appointment_time,
    planned_procedure: req.body.planned_procedure ?? existing.planned_procedure,
    notes: req.body.notes ?? existing.notes,
    status: req.body.status ?? existing.status
  };
  const { errors, data } = validateAppointmentPayload(payload);
  if (errors.length) {
    res.status(400).json({ message: errors[0], errors });
    return;
  }

  const patient = getPatientByPatientId(data.patient_id);
  if (!patient) {
    res.status(400).json({ message: "Valid patient selection is required." });
    return;
  }

  const record = updateAppointment(existing.id, data, new Date().toISOString());
  res.json(record);
});

router.patch("/:appointmentId/status", (req, res) => {
  const existing = getAppointmentById(req.params.appointmentId);
  if (!existing) {
    res.status(404).json({ message: "Appointment not found." });
    return;
  }

  const { errors, data } = validateAppointmentPayload({
    patient_id: existing.patient_id,
    appointment_date: existing.appointment_date,
    appointment_time: existing.appointment_time,
    planned_procedure: existing.planned_procedure,
    notes: existing.notes,
    status: req.body.status
  });
  if (errors.length) {
    res.status(400).json({ message: errors[0], errors });
    return;
  }

  const record = updateAppointmentStatus(existing.id, data.status, new Date().toISOString());
  res.json(record);
});

export default router;
