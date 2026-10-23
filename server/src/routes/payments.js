import express from "express";
import { publishFinanceChange } from "../realtime/financeEvents.js";
import db from "../db/database.js";
import { listPaymentRows, recordPayment, reversePayment } from "../services/paymentLedger.js";
import { getTreatmentByTreatmentId } from "../services/treatmentService.js";

const router = express.Router();

router.get("/:treatmentId/payments", (req, res) => {
  const treatment = getTreatmentByTreatmentId(req.params.treatmentId);
  if (!treatment) return res.status(404).json({ message: "Treatment not found." });
  return res.json({
    treatment,
    payments: listPaymentRows(db, req.params.treatmentId, treatment.net_amount_due)
  });
});

router.post("/:treatmentId/payments", (req, res, next) => {
  try {
    const result = recordPayment(db, req.params.treatmentId, req.body);
    if (!result.repeated) publishFinanceChange();
    return res.status(result.repeated ? 200 : 201).json({
      repeated: result.repeated,
      treatment: getTreatmentByTreatmentId(req.params.treatmentId),
      payment: result.payment
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
});

router.post("/:treatmentId/payments/:paymentId/reverse", (req, res, next) => {
  try {
    const result = reversePayment(db, req.params.treatmentId, req.params.paymentId, req.body);
    if (!result.repeated) publishFinanceChange();
    return res.status(result.repeated ? 200 : 201).json({
      repeated: result.repeated,
      treatment: getTreatmentByTreatmentId(req.params.treatmentId),
      reversal: result.reversal
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
});

export default router;
