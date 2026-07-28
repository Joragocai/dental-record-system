import express from "express";
import db from "../db/database.js";
import { listPatients } from "../services/patientService.js";
import { listTreatments } from "../services/treatmentService.js";
import {
  buildTodayScheduleMetrics,
  getBirthdayReminders,
  getDashboardSummaryData,
  getDateRange,
  getScheduleRows,
  isValidIsoDate
} from "../services/dashboardService.js";

const router = express.Router();

router.get("/summary", (_req, res) => {
  const { today } = getDateRange();
  const patients = listPatients();
  const treatments = listTreatments();

  res.json(getDashboardSummaryData({
    database: db,
    patients,
    treatments,
    todayIso: today
  }));
});

router.get("/schedule", (_req, res) => {
  const { today } = getDateRange();
  const todayScheduleEntries = getScheduleRows(db, today, { includeToday: true });

  res.json({
    todaySchedule: buildTodayScheduleMetrics(todayScheduleEntries, today),
    todayAppointments: todayScheduleEntries,
    upcomingAppointments: getScheduleRows(db, today, { includeToday: false }),
    birthdayReminders: getBirthdayReminders(listPatients()),
    today
  });
});

router.get("/schedule-by-date", (req, res) => {
  const { today } = getDateRange();
  const requestedDate = String(req.query.date || "").trim();
  const date = isValidIsoDate(requestedDate) ? requestedDate : today;

  res.json({
    date,
    appointments: getScheduleRows(db, date, { exactDate: true })
  });
});

export default router;
