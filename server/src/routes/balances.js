import express from "express";
import db from "../db/database.js";
import { getBalancesReport, getPatientFinancialSummary } from "../services/balancesService.js";

const router = express.Router();
router.get("/", (_req, res) => res.json(getBalancesReport(db)));
router.get("/patients/:patientId", (req, res) => {
  const exists = db.prepare("SELECT 1 FROM patients WHERE patient_id = ?").get(req.params.patientId);
  if (!exists) return res.status(404).json({ message: "Patient not found." });
  return res.json(getPatientFinancialSummary(db, req.params.patientId));
});
export default router;
