import express from "express";
import db from "../db/database.js";
import { listPatients } from "../services/patientService.js";
import { listTreatments } from "../services/treatmentService.js";

const router = express.Router();

router.get("/summary", (_req, res) => {
  const patientCount = db.prepare("SELECT COUNT(*) AS count FROM patients").get().count;
  const treatmentCount = db.prepare("SELECT COUNT(*) AS count FROM treatments").get().count;
  res.json({
    patientCount,
    treatmentCount,
    latestPatients: listPatients().slice(-5).reverse(),
    latestTreatments: listTreatments().slice(0, 5)
  });
});

export default router;
