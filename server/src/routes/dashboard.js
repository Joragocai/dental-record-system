import express from "express";
import db from "../db/database.js";
import { listPatients } from "../services/patientService.js";
import { listTreatments } from "../services/treatmentService.js";
import { buildPatientDisplayName } from "../utils/patientUtils.js";

const router = express.Router();

function getDateRange() {
  const today = new Date();

  const toDateString = (value) => value.toISOString().slice(0, 10);
  return {
    today: toDateString(today)
  };
}

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function normalizeProcedure(value) {
  return String(value || "").trim() || "General Appointment";
}

function parseIsoDateParts(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { year, month, day };
}

function formatIsoDateParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function decorateScheduleItems(rows) {
  return rows.map((row) => ({
    ...row,
    patient_name: row.patient_name || buildPatientDisplayName(row),
    appointment_time: row.appointment_time || "",
    procedure_label: normalizeProcedure(row.procedure_label),
    status: row.status || ""
  }));
}

function getScheduleRows(dateValue, { includeToday = false, exactDate = false } = {}) {
  const dateFilter = exactDate ? "schedule_date = ?" : includeToday ? "schedule_date = ?" : "schedule_date > ?";
  const params = [dateValue];

  const rows = db
    .prepare(
      `SELECT *
       FROM (
         SELECT
           'appointment' AS source_type,
           a.id AS source_id,
           a.patient_id,
           p.patient_id AS patient_system_id,
           p.first_name,
           p.middle_name,
           p.last_name,
           p.mobile_number,
           p.branch_location,
           a.appointment_date AS schedule_date,
           a.appointment_time,
           a.planned_procedure AS procedure_label,
           a.status
         FROM appointments a
         JOIN patients p ON p.patient_id = a.patient_id
         WHERE a.status = 'Scheduled'

         UNION ALL

         SELECT
           'treatment_follow_up' AS source_type,
           t.id AS source_id,
           t.patient_id,
           p.patient_id AS patient_system_id,
           p.first_name,
           p.middle_name,
           p.last_name,
           p.mobile_number,
           p.branch_location,
           COALESCE(t.next_appointment_date, t.next_appointment) AS schedule_date,
           t.next_appointment_time AS appointment_time,
           t.procedure AS procedure_label,
           '' AS status
         FROM treatments t
         JOIN patients p ON p.patient_id = t.patient_id
         WHERE COALESCE(t.next_appointment_date, t.next_appointment) IS NOT NULL
           AND trim(COALESCE(t.next_appointment_date, t.next_appointment)) <> ''
       ) scheduled
       WHERE ${dateFilter}
       ORDER BY schedule_date ASC,
                (appointment_time IS NULL OR trim(appointment_time) = '') ASC,
                appointment_time ASC,
                last_name ASC,
                first_name ASC`
    )
    .all(...params);

  return decorateScheduleItems(rows);
}

function getBirthdayReminders() {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const patients = listPatients();

  return patients
    .map((patient) => {
      if (!patient.birthday) return null;
      const birthdayParts = parseIsoDateParts(patient.birthday);
      if (!birthdayParts) return null;

      const nextBirthday = new Date(today.getFullYear(), birthdayParts.month - 1, birthdayParts.day);
      if (nextBirthday < todayStart) {
        nextBirthday.setFullYear(nextBirthday.getFullYear() + 1);
      }

      const diffDays = Math.round((nextBirthday.setHours(0, 0, 0, 0) - todayStart.getTime()) / 86400000);
      if (diffDays < 0 || diffDays > 7) return null;

      const turningAge = nextBirthday.getFullYear() - birthdayParts.year;
      return {
        patient_id: patient.patient_id,
        patient_name: patient.display_name,
        birthday: patient.birthday,
        birthday_date: formatIsoDateParts(nextBirthday.getFullYear(), nextBirthday.getMonth() + 1, nextBirthday.getDate()),
        age_turning: turningAge,
        mobile_number: patient.mobile_number || "",
        branch_location: patient.branch_location || "",
        is_today: diffDays === 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.birthday_date.localeCompare(b.birthday_date) || a.patient_name.localeCompare(b.patient_name));
}

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

router.get("/schedule", (_req, res) => {
  const { today } = getDateRange();

  res.json({
    todayAppointments: getScheduleRows(today, { includeToday: true }),
    upcomingAppointments: getScheduleRows(today, { includeToday: false }),
    birthdayReminders: getBirthdayReminders(),
    today
  });
});

router.get("/schedule-by-date", (req, res) => {
  const { today } = getDateRange();
  const requestedDate = String(req.query.date || "").trim();
  const date = isValidIsoDate(requestedDate) ? requestedDate : today;

  res.json({
    date,
    appointments: getScheduleRows(date, { exactDate: true })
  });
});

export default router;
