import express from "express";
import {
  exportFullPatientRecordWorkbook,
  exportPatientsWorkbook,
  exportPatientTreatmentsWorkbook,
  exportTreatmentsWorkbook
} from "../services/exportService.js";

const router = express.Router();

router.get("/patients", async (_req, res, next) => {
  try {
    const { filePath, filename } = await exportPatientsWorkbook();
    res.download(filePath, filename);
  } catch (error) {
    next(error);
  }
});

router.get("/treatments", async (_req, res, next) => {
  try {
    const { filePath, filename } = await exportTreatmentsWorkbook();
    res.download(filePath, filename);
  } catch (error) {
    next(error);
  }
});

router.get("/patients/:patientId/full-record", async (req, res, next) => {
  try {
    const { filePath, filename } = await exportFullPatientRecordWorkbook(req.params.patientId);
    res.download(filePath, filename);
  } catch (error) {
    next(error);
  }
});

router.get("/patients/:patientId/treatments", async (req, res, next) => {
  try {
    const { filePath, filename } = await exportPatientTreatmentsWorkbook(req.params.patientId);
    res.download(filePath, filename);
  } catch (error) {
    next(error);
  }
});

export default router;
